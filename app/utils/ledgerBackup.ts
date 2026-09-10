import type { Worksheet } from 'exceljs'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENCIES,
  LEDGER_SCHEMA_VERSION,
  TX_TYPES,
} from '../../shared/types/ledger'
import type { LedgerBackup, LedgerBackupPreview, LedgerSnapshot } from '../../shared/types/ledger'
import { z } from 'zod'

type BackupFormat = 'csv' | 'xlsx' | 'json'

const PRODUCT_NAME = 'PocketLedger'
const ACCENT = 'FF5B5BD6'
const HEADER_TEXT = 'FFFFFFFF'
const SOFT_FILL = 'FFF1F0FF'

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function backupFilename(format: BackupFormat): string {
  return `PocketLedger-backup-${timestamp()}.${format}`
}

function safeText(value: string): string {
  const normalized = value.replace(/\u0000/g, '')
  return /^[=+\-@]/.test(normalized.trimStart()) ? `'${normalized}` : normalized
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `"${safeText(value).replace(/"/g, '""')}"`
}

function toOwnedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

async function saveBytes(
  bytes: Uint8Array,
  filename: string,
  format: BackupFormat,
  isTauri: boolean,
): Promise<boolean> {
  if (isTauri) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await save({
      defaultPath: filename,
      filters: [{
        name: format === 'xlsx' ? 'Excel 工作簿' : format === 'json' ? '完整 JSON 备份' : 'CSV 文件',
        extensions: [format],
      }],
    })
    if (!path) return false
    await writeFile(path, bytes)
    return true
  }

  const owned = toOwnedBytes(bytes)
  const mime = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
  const url = URL.createObjectURL(new Blob([owned.buffer], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

const money = z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000)
const jsonBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION, '备份格式版本不受支持'),
  schemaVersion: z.number().int().min(1).max(
    LEDGER_SCHEMA_VERSION,
    '备份数据库版本过新，请升级应用后再恢复',
  ),
  exportedAt: z.iso.datetime({ offset: true }),
  data: z.object({
    accounts: z.array(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      type: z.enum(ACCOUNT_TYPES),
      currency: z.enum(CURRENCIES),
      balance: money,
      sortOrder: z.number().int().min(0).max(100_000),
    }).strict()).max(10_000),
    transactions: z.array(z.object({
      id: z.number().int().positive(),
      date: z.iso.date(),
      type: z.enum(TX_TYPES),
      accountId: z.number().int().positive(),
      amount: money.positive(),
      currency: z.enum(CURRENCIES),
      category: z.string().trim().min(1).max(40),
      note: z.string().trim().max(200).optional(),
      transferId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
    }).strict()).max(1_000_000),
    settings: z.object({
      baseCurrency: z.enum(CURRENCIES),
      masked: z.boolean(),
      theme: z.enum(['light', 'dark']),
    }).strict(),
  }).strict(),
}).strict().superRefine((backup, context) => {
  const accounts = new Map<number, string>()
  const transactionIds = new Set<number>()
  for (const account of backup.data.accounts) {
    if (accounts.has(account.id)) {
      context.addIssue({ code: 'custom', path: ['data', 'accounts'], message: `账户 ID ${account.id} 重复` })
    }
    accounts.set(account.id, account.currency)
  }
  for (const transaction of backup.data.transactions) {
    if (transactionIds.has(transaction.id)) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `流水 ID ${transaction.id} 重复` })
    }
    transactionIds.add(transaction.id)
    const currency = accounts.get(transaction.accountId)
    if (!currency) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `流水 ${transaction.id} 引用了不存在的账户` })
    }
    else if (currency !== transaction.currency) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `流水 ${transaction.id} 的币种与账户不一致` })
    }
  }
  const transfers = new Map<string, typeof backup.data.transactions>()
  for (const transaction of backup.data.transactions) {
    if (!transaction.transferId) continue
    const records = transfers.get(transaction.transferId) ?? []
    records.push(transaction)
    transfers.set(transaction.transferId, records)
  }
  for (const [transferId, records] of transfers) {
    const types = new Set(records.map(record => record.type))
    const accounts = new Set(records.map(record => record.accountId))
    if (
      records.length !== 2
      || types.size !== 2
      || accounts.size !== 2
      || records[0]?.amount !== records[1]?.amount
      || records[0]?.currency !== records[1]?.currency
    ) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `转账 ${transferId} 的两条流水不完整或不一致` })
    }
  }
})

export function createLedgerJson(snapshot: LedgerSnapshot, exportedAt = new Date()): string {
  const backup: LedgerBackup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    data: snapshot,
  }
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function parseLedgerJson(source: string): LedgerBackupPreview {
  if (new TextEncoder().encode(source).byteLength > 50 * 1024 * 1024) {
    throw new Error('备份文件超过 50 MB，已拒绝读取')
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  }
  catch {
    throw new Error('文件不是有效的 JSON 备份')
  }
  const result = jsonBackupSchema.safeParse(value)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? '备份内容无效')
  }
  return {
    backup: result.data,
    accountCount: result.data.data.accounts.length,
    transactionCount: result.data.data.transactions.length,
    exportedAt: result.data.exportedAt,
  }
}

export async function exportLedgerJson(
  snapshot: LedgerSnapshot,
  isTauri: boolean,
): Promise<boolean> {
  return saveBytes(
    new TextEncoder().encode(createLedgerJson(snapshot)),
    backupFilename('json'),
    'json',
    isTauri,
  )
}

async function selectBrowserJson(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    const finish = (value: string | null, error?: unknown) => {
      if (settled) return
      settled = true
      input.remove()
      if (error) reject(error)
      else resolve(value)
    }
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      if (file.size > 50 * 1024 * 1024) {
        return finish(null, new Error('备份文件超过 50 MB，已拒绝读取'))
      }
      try {
        finish(await file.text())
      }
      catch (error) {
        finish(null, error)
      }
    }, { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export async function selectLedgerJson(isTauri: boolean): Promise<LedgerBackupPreview | null> {
  let source: string | null
  if (isTauri) {
    const [{ open }, { readTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: '完整 JSON 备份', extensions: ['json'] }],
    })
    if (!path) return null
    source = await readTextFile(path)
  }
  else {
    source = await selectBrowserJson()
  }
  return source === null ? null : parseLedgerJson(source)
}

function formatExportedAt(date: Date): string {
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function createLedgerCsv(snapshot: LedgerSnapshot, exportedAt = new Date()): string {
  const headers = [
    '记录类型', '格式版本', 'ID', '账户ID', '账户名称', '账户类型', '日期', '收支类型',
    '金额', '币种', '分类', '备注', '排序', '设置键', '设置值',
  ]
  const rows: Array<Array<string | number | boolean | null | undefined>> = [
    ['元数据', BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, '数据库版本', LEDGER_SCHEMA_VERSION],
    ['元数据', BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, '导出时间', exportedAt.toISOString()],
  ]

  for (const account of snapshot.accounts) {
    rows.push([
      '账户', BACKUP_FORMAT_VERSION, account.id, null, account.name, account.type, null, null,
      account.balance, account.currency, null, null, account.sortOrder, null, null,
    ])
  }

  for (const transaction of snapshot.transactions) {
    rows.push([
      '流水', BACKUP_FORMAT_VERSION, transaction.id, transaction.accountId, null, null,
      transaction.date, transaction.type, transaction.amount, transaction.currency,
      transaction.category, transaction.note ?? '', null, null, null,
    ])
  }

  rows.push(
    ['设置', BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'baseCurrency', snapshot.settings.baseCurrency],
    ['设置', BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'masked', snapshot.settings.masked],
    ['设置', BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'theme', snapshot.settings.theme],
  )

  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`
}

export async function exportLedgerCsv(
  snapshot: LedgerSnapshot,
  isTauri: boolean,
): Promise<boolean> {
  const csv = createLedgerCsv(snapshot)
  return saveBytes(
    new TextEncoder().encode(csv),
    backupFilename('csv'),
    'csv',
    isTauri,
  )
}

function parseDate(value: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return safeText(value)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function styleDataSheet(sheet: Worksheet, widths: number[], dateColumn?: number, amountColumn?: number) {
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }]
  const header = sheet.getRow(1)
  header.height = 25
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
    const cell = header.getCell(index + 1)
    cell.font = { bold: true, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } }
  if (dateColumn && sheet.rowCount > 1) {
    sheet.getColumn(dateColumn).numFmt = 'yyyy-mm-dd'
  }
  if (amountColumn && sheet.rowCount > 1) {
    sheet.getColumn(amountColumn).numFmt = '#,##0.########'
  }
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    for (let column = 1; column <= widths.length; column += 1) {
      const cell = sheet.getRow(row).getCell(column)
      if (row % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8FC' } }
      }
      cell.alignment = { vertical: 'middle' }
    }
  }
}

export async function createLedgerXlsx(
  snapshot: LedgerSnapshot,
  exportedAt = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = PRODUCT_NAME
  workbook.created = exportedAt
  workbook.modified = exportedAt

  const info = workbook.addWorksheet('说明', { views: [{ showGridLines: false }] })
  info.mergeCells('A1:D1')
  info.getCell('A1').value = `${PRODUCT_NAME}数据备份`
  info.getCell('A1').font = { bold: true, size: 18, color: { argb: HEADER_TEXT } }
  info.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
  info.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  info.getRow(1).height = 34
  info.addRows([
    [],
    ['项目', '内容'],
    ['备份格式版本', BACKUP_FORMAT_VERSION],
    ['数据库结构版本', LEDGER_SCHEMA_VERSION],
    ['导出时间', formatExportedAt(exportedAt)],
    ['账户数量', snapshot.accounts.length],
    ['流水数量', snapshot.transactions.length],
    ['说明', '账户、流水和设置分别保存在对应工作表中。请保留原始 ID，便于后续恢复或迁移。'],
  ])
  info.getRow(3).eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
  })
  for (let row = 4; row <= 9; row += 1) {
    const cell = info.getRow(row).getCell(1)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT_FILL } }
  }
  info.getColumn(1).width = 20
  info.getColumn(2).width = 66
  info.getCell('B9').alignment = { wrapText: true, vertical: 'top' }
  info.getRow(9).height = 38

  const accounts = workbook.addWorksheet('账户')
  accounts.addRow(['ID', '名称', '类型代码', '类型', '币种', '余额', '排序'])
  accounts.addRows(snapshot.accounts.map(account => [
    account.id,
    safeText(account.name),
    account.type,
    ACCOUNT_TYPE_LABELS[account.type],
    account.currency,
    account.balance,
    account.sortOrder,
  ]))
  styleDataSheet(accounts, [10, 24, 14, 16, 12, 18, 10], undefined, 6)

  const accountNames = new Map(snapshot.accounts.map(account => [account.id, account.name]))
  const transactions = workbook.addWorksheet('流水')
  transactions.addRow(['ID', '日期', '收支类型代码', '收支类型', '账户ID', '账户名称', '金额', '币种', '分类', '备注'])
  transactions.addRows(snapshot.transactions.map(transaction => [
    transaction.id,
    parseDate(transaction.date),
    transaction.type,
    transaction.type === 'income' ? '收入' : '支出',
    transaction.accountId,
    safeText(accountNames.get(transaction.accountId) ?? '未知账户'),
    transaction.amount,
    transaction.currency,
    safeText(transaction.category),
    safeText(transaction.note ?? ''),
  ]))
  styleDataSheet(transactions, [10, 14, 16, 12, 12, 24, 18, 12, 18, 36], 2, 7)

  const settings = workbook.addWorksheet('设置')
  settings.addRow(['设置键', '设置值', '说明'])
  settings.addRows([
    ['baseCurrency', snapshot.settings.baseCurrency, '摘要与报表使用的基准币种'],
    ['masked', snapshot.settings.masked, '是否隐藏金额'],
    ['theme', snapshot.settings.theme, '界面主题'],
  ])
  styleDataSheet(settings, [24, 20, 42])

  const buffer = await workbook.xlsx.writeBuffer()
  return toOwnedBytes(new Uint8Array(buffer))
}

export async function exportLedgerXlsx(
  snapshot: LedgerSnapshot,
  isTauri: boolean,
): Promise<boolean> {
  const bytes = await createLedgerXlsx(snapshot)
  return saveBytes(
    bytes,
    backupFilename('xlsx'),
    'xlsx',
    isTauri,
  )
}
