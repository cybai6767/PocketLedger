import type { Worksheet } from 'exceljs'
import Decimal from 'decimal.js'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_LABELS_EN,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENCIES,
  DEFAULT_SETTINGS,
  LEDGER_SCHEMA_VERSION,
  TX_TYPES,
} from '../../shared/types/ledger'
import type { AccountType, Currency, Language, LedgerBackup, LedgerBackupPreview, LedgerImportIssue, LedgerSnapshot, Settings, TransactionSource, TxType } from '../../shared/types/ledger'
import { z } from 'zod'
import { transactionSourceSchema } from '../../shared/utils/importSource'

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
  return /^[=+\-@']/.test(normalized.trimStart()) ? `'${normalized}` : normalized
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
  language: Language,
): Promise<boolean> {
  if (isTauri) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await save({
      defaultPath: filename,
      filters: [{
        name: language === 'en'
          ? (format === 'xlsx' ? 'Excel workbook' : format === 'json' ? 'Complete JSON backup' : 'CSV file')
          : (format === 'xlsx' ? 'Excel 工作簿' : format === 'json' ? '完整 JSON 备份' : 'CSV 文件'),
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

function absentText(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

const optionalNote = z.preprocess(
  absentText,
  z.string().trim().max(200).optional(),
)
const optionalTransferId = z.preprocess(
  value => (value === null || value === '') ? undefined : value,
  z.string().regex(/^[a-f0-9]{32}$/i).optional(),
)

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
      note: optionalNote,
      transferId: optionalTransferId,
      source: transactionSourceSchema.optional(),
    }).strict()).max(1_000_000),
    settings: z.object({
      baseCurrency: z.enum(CURRENCIES),
      masked: z.boolean(),
      theme: z.enum(['light', 'dark']),
      language: z.enum(['zh-CN', 'en']).default('zh-CN'),
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

function localizeBackupError(message: string, language: Language): string {
  if (language !== 'en') return message
  if (message.includes('备份格式版本不受支持')) return 'This backup format version is not supported'
  if (message.includes('备份数据库版本过新')) return 'This backup requires a newer version of PocketLedger'
  if (message.includes('引用了不存在的账户')) return 'A transaction references an account that does not exist'
  if (message.includes('币种与账户不一致')) return 'A transaction currency does not match its account'
  if (message.includes('重复')) return 'The backup contains duplicate IDs'
  if (message.includes('转账') && message.includes('不完整或不一致')) return 'The backup contains an incomplete or inconsistent transfer'
  return 'The backup content is invalid'
}

export function parseLedgerJson(
  source: string,
  language: Language = 'zh-CN',
): LedgerBackupPreview {
  const normalized = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  if (new TextEncoder().encode(normalized).byteLength > 50 * 1024 * 1024) {
    throw new Error(language === 'en' ? 'The backup is larger than 50 MB and cannot be opened' : '备份文件超过 50 MB，已拒绝读取')
  }
  let value: unknown
  try {
    value = JSON.parse(normalized)
  }
  catch {
    throw new Error(language === 'en' ? 'The selected file is not a valid JSON backup' : '文件不是有效的 JSON 备份')
  }
  const result = jsonBackupSchema.safeParse(value)
  if (!result.success) {
    throw new Error(localizeBackupError(result.error.issues[0]?.message ?? '备份内容无效', language))
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
    snapshot.settings.language,
  )
}

async function selectBrowserBackups(
  language: Language,
  settings: Settings,
): Promise<LedgerBackupPreview[] | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    let settled = false
    const finish = (value: LedgerBackupPreview[] | null, error?: unknown) => {
      if (settled) return
      settled = true
      input.remove()
      if (error) reject(error)
      else resolve(value)
    }
    input.type = 'file'
    input.multiple = true
    input.accept = '.json,.xlsx,.csv,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])]
      if (files.length === 0) return finish(null)
      try {
        const previews: LedgerBackupPreview[] = []
        for (const file of files) {
          if (file.size > 50 * 1024 * 1024) {
            throw backupError(language, '备份文件超过 50 MB，已拒绝读取', 'The backup is larger than 50 MB and cannot be opened')
          }
          previews.push(await parseLedgerBackupBytes(new Uint8Array(await file.arrayBuffer()), file.name, language, settings))
        }
        finish(previews)
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

export function jsonBackupOpenOptions(language: Language, listAllFiles: boolean) {
  return {
    multiple: true as const,
    directory: false as const,
    ...(listAllFiles
      ? {}
      : {
          filters: [{
            name: language === 'en' ? 'Ledger backup' : '账本备份',
            extensions: ['json', 'xlsx', 'csv'],
          }],
        }),
  }
}

function listAllBackupFiles(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

export async function selectLedgerBackups(
  isTauri: boolean,
  language: Language = 'zh-CN',
  settings: Settings = { ...DEFAULT_SETTINGS, language },
): Promise<LedgerBackupPreview[] | null> {
  if (!isTauri) return selectBrowserBackups(language, settings)
  const [{ open }, { readFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ])
  // Android maps an extension filter to a MIME type and then hides files that
  // were saved as text/plain or octet-stream, so the picker lists every file.
  const selected = await open(jsonBackupOpenOptions(language, listAllBackupFiles())) as string | string[] | null
  const paths = Array.isArray(selected) ? selected : (typeof selected === 'string' && selected.length > 0 ? [selected] : [])
  if (paths.length === 0) return null
  const previews: LedgerBackupPreview[] = []
  for (const path of paths) {
    previews.push(await parseLedgerBackupBytes(await readFile(path), path, language, settings))
  }
  return previews
}

export async function selectLedgerBackup(isTauri: boolean, language: Language = 'zh-CN', settings: Settings = { ...DEFAULT_SETTINGS, language }): Promise<LedgerBackupPreview | null> {
  const previews = await selectLedgerBackups(isTauri, language, settings)
  return previews ? mergeLedgerBackups(previews, language) : null
}

function backupError(language: Language, zh: string, en: string): Error {
  return new Error(language === 'en' ? en : zh)
}

function filenameOf(path: string): string {
  let clean = path.split('?')[0] ?? path
  try { clean = decodeURIComponent(clean) } catch { /* A literal % is valid in a filename. */ }
  const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return clean.slice(slash + 1)
}

function backupKind(bytes: Uint8Array, filename: string): 'json' | 'xlsx' | 'csv' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.csv')) return 'csv'
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx'
  const head = new TextDecoder().decode(bytes.subarray(0, 200)).replace(/^\uFEFF/, '').trimStart()
  return head.startsWith('{') ? 'json' : 'csv'
}

function decodeBackupText(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('gb18030').decode(bytes) }
}

function parseCsvTable(source: string): string[][] {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        }
        else quoted = false
      }
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    }
    else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    }
    else if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function headerMap(headers: string[]): Map<string, number> {
  return new Map(headers.map((header, index) => [header.replace(/\s/g, '').toLowerCase(), index]))
}

function column(row: string[], headers: Map<string, number>, ...names: string[]): string {
  for (const name of names) {
    const index = headers.get(name.replace(/\s/g, '').toLowerCase())
    if (index !== undefined && row[index]?.trim()) return row[index]!.trim()
  }
  return ''
}

function padDatePart(value: number | string): string {
  return String(value).padStart(2, '0')
}

function dateFromValue(value: unknown, language: Language, rowNumber: number): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0
    const year = utcMidnight ? value.getUTCFullYear() : value.getFullYear()
    const month = (utcMidnight ? value.getUTCMonth() : value.getMonth()) + 1
    const day = utcMidnight ? value.getUTCDate() : value.getDate()
    return `${year}-${padDatePart(month)}-${padDatePart(day)}`
  }
  const text = String(value ?? '').trim()
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text)
  if (!match) {
    throw backupError(
      language,
      `第 ${rowNumber} 行的日期无法识别`,
      `The date on row ${rowNumber} could not be read`,
    )
  }
  const date = `${match[1]}-${padDatePart(match[2] ?? '')}-${padDatePart(match[3] ?? '')}`
  if (!z.iso.date().safeParse(date).success) throw backupError(language, `第 ${rowNumber} 行的日期无效`, `The date on row ${rowNumber} is invalid`)
  return date
}

function amountFromValue(value: unknown, language: Language, rowNumber: number): number {
  const number = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim().replace(/,/g, ''))
  if (!Number.isFinite(number) || number <= 0) {
    throw backupError(
      language,
      `第 ${rowNumber} 行的金额无效`,
      `The amount on row ${rowNumber} is invalid`,
    )
  }
  return new Decimal(number).toDecimalPlaces(8).toNumber()
}

function plainText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => (part && typeof part === 'object' && 'text' in part ? String(part.text) : '')).join('')
    }
    if ('result' in value && value.result != null) return plainText(value.result)
    if ('text' in value && value.text != null) return String(value.text)
  }
  return String(value)
}

function sheetRows(sheet: Worksheet): string[][] {
  const rows: string[][] = []
  const width = Math.max(sheet.columnCount, sheet.getRow(1).cellCount, 1)
  for (let index = 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index)
    const values = Array.from({ length: width }, (_, columnIndex) => plainText(row.getCell(columnIndex + 1).value).trim())
    rows.push(values)
  }
  return rows
}

function currencyFromText(value: string, language: Language, rowNumber: number): Currency {
  const currency = value.trim().toUpperCase()
  if ((CURRENCIES as readonly string[]).includes(currency)) return currency as Currency
  throw backupError(
    language,
    `第 ${rowNumber} 行使用了不支持的币种`,
    `Row ${rowNumber} uses an unsupported currency`,
  )
}

function accountTypeFromLabel(value: string): AccountType | null {
  const code = ACCOUNT_TYPES.find(type => type === value)
  if (code) return code
  const zh = (Object.entries(ACCOUNT_TYPE_LABELS) as Array<[AccountType, string]>).find(([, label]) => label === value)
  if (zh) return zh[0]
  const en = (Object.entries(ACCOUNT_TYPE_LABELS_EN) as Array<[AccountType, string]>).find(([, label]) => label === value)
  return en?.[0] ?? null
}

function inferAccountType(name: string): AccountType {
  const text = name.toLowerCase()
  if (/信用|credit|花呗|白条/.test(text)) return 'credit'
  if (/现金|cash/.test(text)) return 'cash'
  if (/银行|储蓄|借记|bank/.test(text)) return 'bank'
  if (/微信|支付宝|钱包|alipay|wechat|paypal/.test(text)) return 'wallet'
  if (/理财|基金|股票|invest/.test(text)) return 'invest'
  if (/贷款|借呗|负债|loan|debt/.test(text)) return 'debt'
  return 'other'
}

function transactionTypeFromText(value: string): TxType | null {
  const text = value.trim().toLowerCase()
  if (['收入', 'income'].includes(text)) return 'income'
  if (['支出', 'expense'].includes(text)) return 'expense'
  return null
}

function unescapeExportText(value: string): string {
  return value.startsWith("'") && /^[=+\-@']/.test(value.slice(1).trimStart()) ? value.slice(1) : value
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

function checkedPreview(
  backup: LedgerBackup,
  language: Language,
  sourceLabel?: string,
): LedgerBackupPreview {
  const preview = parseLedgerJson(JSON.stringify(backup), language)
  return sourceLabel ? { ...preview, sourceLabel } : preview
}

function isPocketHeader(headers: string[]): boolean {
  const mapped = headerMap(headers)
  return mapped.has('记录类型') || mapped.has('recordtype') || (mapped.has('id') && (mapped.has('类型代码') || mapped.has('typecode')))
}

function isSuishoujiHeader(headers: string[]): boolean {
  const mapped = headerMap(headers)
  return mapped.has('交易类型') && mapped.has('金额') && (mapped.has('支出账户') || mapped.has('收入账户') || mapped.has('账户'))
}

function sheetKind(name: string, headers: Map<string, number>): 'mixed' | 'account' | 'transaction' | 'setting' | null {
  if (name === '账户' || name === 'Accounts') return 'account'
  if (name === '流水' || name === 'Transactions') return 'transaction'
  if (name === '设置' || name === 'Settings') return 'setting'
  if (headers.has('记录类型') || headers.has('recordtype')) return 'mixed'
  return null
}

function parsePocketRows(
  tables: Array<{ name: string, rows: string[][] }>,
  language: Language,
  settings: Settings,
): LedgerBackupPreview {
  const accounts: LedgerSnapshot['accounts'] = []
  const transactions: LedgerSnapshot['transactions'] = []
  const nextSettings: Settings = { ...settings }
  let exportedAt = new Date().toISOString()
  let schemaVersion = LEDGER_SCHEMA_VERSION
  let formatVersion = BACKUP_FORMAT_VERSION

  for (const table of tables) {
    if (table.name === '说明' || table.name === 'About') {
      for (const row of table.rows) {
        if (row[0] === '备份格式版本' || row[0] === 'Backup format version') formatVersion = Number(row[1])
        if (row[0] === '数据库结构版本' || row[0] === 'Database schema version') schemaVersion = Number(row[1])
        if (row[0] === '导出时间' || row[0] === 'Exported at') {
          const value = new Date(row[1] ?? '')
          if (!Number.isNaN(value.getTime())) exportedAt = value.toISOString()
        }
      }
      continue
    }
    const [header, ...records] = table.rows
    if (!header) continue
    const headers = headerMap(header)
    const kind = sheetKind(table.name, headers)
    if (!kind) continue
    records.forEach((row, index) => {
      const rowNumber = index + 2
      const recordType = kind === 'mixed' ? column(row, headers, '记录类型', 'Record type') : kind
      if (recordType === '元数据' || recordType === 'Metadata') {
        const key = column(row, headers, '设置键', 'Setting key')
        const value = column(row, headers, '设置值', 'Setting value')
        const version = column(row, headers, '格式版本', 'Format version')
        if (version) formatVersion = Number(version)
        if (key === '数据库版本' || key === 'Schema version') schemaVersion = Number(value)
        if (key === '导出时间' || key === 'Exported at') {
          const parsed = new Date(value)
          if (!Number.isNaN(parsed.getTime())) exportedAt = parsed.toISOString()
        }
        return
      }
      if (recordType === '设置' || recordType === 'Setting' || recordType === 'setting') {
        assignSetting(nextSettings, column(row, headers, '设置键', 'Setting key'), column(row, headers, '设置值', 'Setting value'))
        return
      }
      if (recordType === '账户' || recordType === 'Account' || recordType === 'account') {
        const id = Number(column(row, headers, 'ID'))
        const name = unescapeExportText(column(row, headers, '账户名称', '名称', 'Account name', 'Name'))
        const type = accountTypeFromLabel(column(row, headers, '类型代码', 'Type code'))
          ?? accountTypeFromLabel(column(row, headers, '账户类型', '类型', 'Account type', 'Type'))
        const balance = Number(column(row, headers, '余额', '金额', 'Balance', 'Amount').replace(/,/g, ''))
        if (!Number.isInteger(id) || id <= 0 || !name || !type || !Number.isFinite(balance)) {
          throw backupError(language, `第 ${rowNumber} 行的账户无法读取`, `The account on row ${rowNumber} could not be read`)
        }
        accounts.push({
          id,
          name: clip(name, 80),
          type,
          currency: currencyFromText(column(row, headers, '币种', 'Currency'), language, rowNumber),
          balance: new Decimal(balance).toDecimalPlaces(8).toNumber(),
          sortOrder: Number(column(row, headers, '排序', 'Sort order') || accounts.length),
        })
        return
      }
      if (recordType === '流水' || recordType === 'Transaction' || recordType === 'transaction') {
        const type = transactionTypeFromText(column(row, headers, '收支类型代码', '收支类型', 'Type code', 'Type', 'Transaction type'))
        const accountId = Number(column(row, headers, '账户ID', 'Account ID'))
        const category = unescapeExportText(column(row, headers, '分类', 'Category'))
        const note = unescapeExportText(column(row, headers, '备注', 'Note'))
        const transferId = column(row, headers, '转账ID', 'Transfer ID')
        const sourceText = column(row, headers, '来源详情', 'Source detail')
        const source = sourceText ? transactionSourceSchema.parse(JSON.parse(unescapeExportText(sourceText))) : undefined
        if (!type || !Number.isInteger(accountId) || accountId <= 0 || !category) {
          throw backupError(language, `第 ${rowNumber} 行的流水无法读取`, `The transaction on row ${rowNumber} could not be read`)
        }
        transactions.push({
          id: Number(column(row, headers, 'ID')) || transactions.length + 1,
          date: dateFromValue(column(row, headers, '日期', 'Date'), language, rowNumber),
          type,
          accountId,
          amount: amountFromValue(column(row, headers, '金额', 'Amount'), language, rowNumber),
          currency: currencyFromText(column(row, headers, '币种', 'Currency'), language, rowNumber),
          category: clip(category, 40),
          ...(note ? { note: clip(note, 200) } : {}),
          ...(transferId ? { transferId } : {}),
          ...(source ? { source } : {}),
        })
      }
    })
  }

  return checkedPreview({
    format: BACKUP_FORMAT,
    formatVersion,
    schemaVersion,
    exportedAt,
    data: { accounts, transactions, settings: nextSettings },
  }, language)
}

function assignSetting(settings: Settings, key: string, value: string) {
  if (key === 'baseCurrency' && (CURRENCIES as readonly string[]).includes(value)) settings.baseCurrency = value as Currency
  if (key === 'masked') settings.masked = value === 'true' || value === '1'
  if (key === 'theme' && (value === 'light' || value === 'dark')) settings.theme = value
  if (key === 'language' && (value === 'zh-CN' || value === 'en')) settings.language = value
}

function parseSuishoujiRows(
  tables: Array<{ name: string, rows: string[][] }>,
  language: Language,
  settings: Settings,
  file?: { fileName: string, fileId: string },
): LedgerBackupPreview {
  const issues: LedgerImportIssue[] = []
  let recognized = false
  const imported: Array<{ order: number, date: string, type: TxType, account: string, currency: Currency, amount: number, category: string, note?: string, source?: TransactionSource }> = []
  let order = 0
  for (const table of tables) {
    const headerIndex = table.rows.slice(0, 50).findIndex(isSuishoujiHeader)
    if (headerIndex < 0) continue
    recognized = true
    const header = table.rows[headerIndex]!
    const records = table.rows.slice(headerIndex + 1)
    const headers = headerMap(header)
    records.forEach((row, index) => {
      const rowNumber = headerIndex + index + 2
      if (row.every(cell => cell.trim() === '')) return
      try {
      const type = transactionTypeFromText(column(row, headers, '交易类型'))
        ?? (table.name === '收入' ? 'income' : table.name === '支出' ? 'expense' : null)
      const account = column(row, headers, '支出账户', '收入账户', '账户')
      const category = column(row, headers, '二级分类') || column(row, headers, '一级分类') || (language === 'en' ? 'Uncategorized' : '未分类')
      const note = [column(row, headers, '备注'), column(row, headers, '商家'), column(row, headers, '项目')].filter(Boolean).join(' · ')
      if (!type || !account) {
        throw backupError(language, `第 ${rowNumber} 行缺少交易类型或账户`, `Row ${rowNumber} is missing a transaction type or account`)
      }
      imported.push({
        order,
        date: dateFromValue(column(row, headers, '日期'), language, rowNumber),
        type,
        account: clip(account, 80),
        currency: currencyFromText(column(row, headers, '账户币种', '币种') || settings.baseCurrency, language, rowNumber),
        amount: amountFromValue(column(row, headers, '金额'), language, rowNumber),
        category: clip(category, 40),
        ...(note ? { note: clip(note, 200) } : {}),
        ...(file ? { source: transactionSourceSchema.parse({ format: 'suishouji', ...file, sheet: table.name, row: rowNumber,
          fields: Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])) }) } : {}),
      })
      order += 1
      } catch (error) {
        issues.push({ file: file?.fileName ?? '', sheet: table.name, row: rowNumber, message: error instanceof Error ? error.message : String(error) })
      }
    })
  }
  if (!recognized) {
    throw backupError(
      language,
      '无法识别这份表格。请使用口袋账本或随手记导出的 Excel / CSV。',
      'This spreadsheet was not recognized. Use a PocketLedger or Suishouji Excel / CSV export.',
    )
  }
  imported.sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order)
  const accounts = new Map<string, LedgerSnapshot['accounts'][number]>()
  const nets = new Map<string, Decimal>()
  for (const record of imported) {
    const key = `${record.account}\u0000${record.currency}`
    if (!accounts.has(key)) {
      accounts.set(key, {
        id: accounts.size + 1,
        name: record.account,
        type: inferAccountType(record.account),
        currency: record.currency,
        balance: 0,
        sortOrder: accounts.size,
      })
      nets.set(key, new Decimal(0))
    }
    const net = nets.get(key) ?? new Decimal(0)
    nets.set(key, record.type === 'income' ? net.plus(record.amount) : net.minus(record.amount))
  }
  const accountList = [...accounts.entries()].map(([key, account]) => ({
    ...account,
    balance: (nets.get(key) ?? new Decimal(0)).toDecimalPlaces(8).toNumber(),
  }))
  const accountIds = new Map([...accounts.entries()].map(([key, account]) => [key, account.id]))
  const currencies = new Set(accountList.map(account => account.currency))
  const preview = checkedPreview({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: accountList,
      transactions: imported.map((record, index) => ({
        id: index + 1,
        date: record.date,
        type: record.type,
        accountId: accountIds.get(`${record.account}\u0000${record.currency}`) ?? 0,
        amount: record.amount,
        currency: record.currency,
        category: record.category,
        ...(record.note ? { note: record.note } : {}),
        ...(record.source ? { source: record.source } : {}),
      })),
      settings: {
        ...settings,
        baseCurrency: currencies.size === 1 ? [...currencies][0] ?? settings.baseCurrency : settings.baseCurrency,
      },
    },
  }, language, language === 'en' ? 'Suishouji spreadsheet' : '随手记表格')
  return { ...preview, ...(issues.length ? { issues } : {}) }
}

function parseTableBackup(
  tables: Array<{ name: string, rows: string[][] }>,
  language: Language,
  settings: Settings,
  file?: { fileName: string, fileId: string },
): LedgerBackupPreview {
  const headers = tables.map(table => table.rows[0] ?? [])
  if (headers.some(isPocketHeader) || tables.some(table => table.name === '账户' || table.name === 'Accounts')) {
    const pocketTables = tables.filter(table => ['账户', '流水', '设置', '说明', 'Accounts', 'Transactions', 'Settings', 'About'].includes(table.name))
    return parsePocketRows(pocketTables.length > 0 ? pocketTables : tables, language, settings)
  }
  return parseSuishoujiRows(tables, language, settings, file)
}

export function mergeLedgerBackups(
  previews: LedgerBackupPreview[],
  language: Language = 'zh-CN',
): LedgerBackupPreview {
  const first = previews[0]
  if (!first) {
    throw backupError(language, '没有选择备份文件', 'No backup file was selected')
  }
  if (previews.length === 1) return first

  const accounts = new Map<string, { name: string, type: AccountType, currency: Currency, opening: Decimal, sortOrder: number }>()
  const transactions: Array<{ order: number, date: string, type: TxType, accountKey: string, amount: number, currency: Currency, category: string, note?: string, transferId?: string, source?: TransactionSource }> = []
  const seen = new Set<string>()
  const usedTransferIds = new Set<string>()
  let transferSequence = 0
  let order = 0
  let settings = first.backup.data.settings
  let exportedAt = first.exportedAt

  for (const preview of previews) {
    if (!preview.sourceLabel) settings = preview.backup.data.settings
    if (preview.exportedAt > exportedAt) exportedAt = preview.exportedAt
    const byId = new Map(preview.backup.data.accounts.map(account => [account.id, account]))
    const fileKeys = new Set<string>()
    const sourceNets = new Map<number, Decimal>()
    const transferMembers = new Map<string, string[]>()
    const remappedTransferIds = new Map<string, string>()
    const identityOf = (item: LedgerSnapshot['transactions'][number]) => {
      const account = byId.get(item.accountId)!
      return JSON.stringify([account.name, account.currency, item.date, item.type, item.amount, item.currency, item.category, item.note ?? '', item.source?.fields['日期'] ?? ''])
    }
    for (const item of preview.backup.data.transactions) {
      const net = sourceNets.get(item.accountId) ?? new Decimal(0)
      sourceNets.set(item.accountId, item.type === 'income' ? net.plus(item.amount) : net.minus(item.amount))
      if (!item.transferId) continue
      const members = transferMembers.get(item.transferId) ?? []
      members.push(identityOf(item))
      transferMembers.set(item.transferId, members)
    }
    const transferSignatures = new Map([...transferMembers].map(([id, members]) => [id, JSON.stringify(members.sort())]))
    for (const account of preview.backup.data.accounts) {
      const key = `${account.name}\u0000${account.currency}`
      const net = sourceNets.get(account.id) ?? new Decimal(0)
      const opening = new Decimal(account.balance).minus(net)
      const existing = accounts.get(key)
      if (!existing) {
        accounts.set(key, {
          name: account.name,
          type: account.type,
          currency: account.currency,
          opening,
          sortOrder: accounts.size,
        })
      }
      else {
        if (existing.opening.isZero() && !opening.isZero()) existing.opening = opening
        if (existing.type === 'other' && account.type !== 'other') existing.type = account.type
      }
    }
    for (const item of preview.backup.data.transactions) {
      const account = byId.get(item.accountId)
      if (!account) continue
      const accountKey = `${account.name}\u0000${account.currency}`
      // Deduplicate a transfer using both legs; ordinary entries remain distinct.
      const identity = JSON.stringify(item.transferId
        ? ['transfer', transferSignatures.get(item.transferId), identityOf(item)]
        : ['transaction', identityOf(item)])
      if (seen.has(identity)) continue
      fileKeys.add(identity)
      let transferId: string | undefined
      if (item.transferId) {
        transferId = remappedTransferIds.get(item.transferId)
        if (!transferId) {
          transferId = item.transferId
          // These are relationship IDs, not credentials. Keep them unique in the merged ledger.
          while (usedTransferIds.has(transferId)) transferId = (++transferSequence).toString(16).padStart(32, '0')
          usedTransferIds.add(transferId)
          remappedTransferIds.set(item.transferId, transferId)
        }
      }
      transactions.push({
        order,
        date: item.date,
        type: item.type,
        accountKey,
        amount: item.amount,
        currency: item.currency,
        category: item.category,
        ...(item.note ? { note: item.note } : {}),
        ...(transferId ? { transferId } : {}),
        ...(item.source ? { source: item.source } : {}),
      })
      order += 1
    }
    for (const key of fileKeys) seen.add(key)
  }

  transactions.sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order)
  const mergedNets = new Map<string, Decimal>()
  for (const item of transactions) {
    const net = mergedNets.get(item.accountKey) ?? new Decimal(0)
    mergedNets.set(item.accountKey, item.type === 'income' ? net.plus(item.amount) : net.minus(item.amount))
  }
  const accountList = [...accounts.entries()].map(([key, account], index) => {
    const net = mergedNets.get(key) ?? new Decimal(0)
    return {
      id: index + 1,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.opening.plus(net).toDecimalPlaces(8).toNumber(),
      sortOrder: account.sortOrder,
    }
  })
  const idByKey = new Map([...accounts.keys()].map((key, index) => [key, index + 1]))
  const labels = [...new Set(previews.map(item => item.sourceLabel).filter((label): label is string => Boolean(label)))]
  const sourceLabel = labels.length === 1
    ? `${labels[0]} · ${previews.length} ${language === 'en' ? 'files' : '个文件'}`
    : (language === 'en' ? `${previews.length} files` : `${previews.length} 个文件`)

  return checkedPreview({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    exportedAt,
    data: {
      accounts: accountList,
      transactions: transactions.map((item, index) => ({
        id: index + 1,
        date: item.date,
        type: item.type,
        accountId: idByKey.get(item.accountKey) ?? 0,
        amount: item.amount,
        currency: item.currency,
        category: item.category,
        ...(item.note ? { note: item.note } : {}),
        ...(item.transferId ? { transferId: item.transferId } : {}),
        ...(item.source ? { source: item.source } : {}),
      })),
      settings,
    },
  }, language, sourceLabel)
}

async function importFileId(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', toOwnedBytes(bytes).buffer)
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
  }
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (const value of bytes) { a = Math.imul(a ^ value, 0x01000193); b = Math.imul(b ^ value, 0x85ebca6b) }
  return `file-${bytes.length}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`
}

export async function parseLedgerBackupBytes(
  bytes: Uint8Array,
  filename: string,
  language: Language = 'zh-CN',
  settings: Settings = { ...DEFAULT_SETTINGS, language },
): Promise<LedgerBackupPreview> {
  if (bytes.byteLength > 50 * 1024 * 1024) {
    throw backupError(language, '备份文件超过 50 MB，已拒绝读取', 'The backup is larger than 50 MB and cannot be opened')
  }
  const fileName = clip(filenameOf(filename), 255)
  const fileId = await importFileId(bytes)
  const file = { fileName, fileId }
  const kind = backupKind(bytes, fileName)
  if (kind === 'json') return { ...parseLedgerJson(decodeBackupText(bytes), language), ...file }
  if (kind === 'csv') {
    const rows = parseCsvTable(decodeBackupText(bytes))
    return { ...parseTableBackup([{ name: 'csv', rows }], language, settings, file), ...file }
  }
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  await workbook.xlsx.load(buffer)
  return { ...parseTableBackup(
    workbook.worksheets.map(sheet => ({ name: sheet.name, rows: sheetRows(sheet) })),
    language, settings, file,
  ), ...file }
}

export function createLedgerCsv(snapshot: LedgerSnapshot, exportedAt = new Date()): string {
  const english = snapshot.settings.language === 'en'
  const headers = english
    ? ['Record type', 'Format version', 'ID', 'Account ID', 'Account name', 'Account type', 'Date', 'Transaction type', 'Amount', 'Currency', 'Category', 'Note', 'Sort order', 'Setting key', 'Setting value', 'Transfer ID', 'Source detail']
    : ['记录类型', '格式版本', 'ID', '账户ID', '账户名称', '账户类型', '日期', '收支类型', '金额', '币种', '分类', '备注', '排序', '设置键', '设置值', '转账ID', '来源详情']
  const labels = english
    ? { metadata: 'Metadata', account: 'Account', transaction: 'Transaction', settings: 'Setting', schema: 'Schema version', exportedAt: 'Exported at' }
    : { metadata: '元数据', account: '账户', transaction: '流水', settings: '设置', schema: '数据库版本', exportedAt: '导出时间' }
  const rows: Array<Array<string | number | boolean | null | undefined>> = [
    [labels.metadata, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, labels.schema, LEDGER_SCHEMA_VERSION],
    [labels.metadata, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, labels.exportedAt, exportedAt.toISOString()],
  ]

  for (const account of snapshot.accounts) {
    rows.push([
      labels.account, BACKUP_FORMAT_VERSION, account.id, null, account.name,
      english ? ACCOUNT_TYPE_LABELS_EN[account.type] : ACCOUNT_TYPE_LABELS[account.type], null, null,
      account.balance, account.currency, null, null, account.sortOrder, null, null,
    ])
  }

  for (const transaction of snapshot.transactions) {
    rows.push([
      labels.transaction, BACKUP_FORMAT_VERSION, transaction.id, transaction.accountId, null, null,
      transaction.date, english ? (transaction.type === 'income' ? 'Income' : 'Expense') : (transaction.type === 'income' ? '收入' : '支出'), transaction.amount, transaction.currency,
      transaction.category, transaction.note ?? '', null, null, null, transaction.transferId ?? '', transaction.source ? JSON.stringify(transaction.source) : '',
    ])
  }

  rows.push(
    [labels.settings, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'baseCurrency', snapshot.settings.baseCurrency],
    [labels.settings, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'masked', snapshot.settings.masked],
    [labels.settings, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'theme', snapshot.settings.theme],
    [labels.settings, BACKUP_FORMAT_VERSION, null, null, null, null, null, null, null, null, null, null, null, 'language', snapshot.settings.language],
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
    snapshot.settings.language,
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
  const english = snapshot.settings.language === 'en'
  workbook.creator = PRODUCT_NAME
  workbook.created = exportedAt
  workbook.modified = exportedAt

  const accountNames = new Map(snapshot.accounts.map(account => [account.id, account.name]))
  const transactions = workbook.addWorksheet(english ? 'Transactions' : '流水')
  transactions.addRow(english ? ['ID', 'Date', 'Type code', 'Type', 'Account ID', 'Account name', 'Amount', 'Currency', 'Category', 'Note', 'Transfer ID', 'Source detail', 'Original date/time', 'Primary category', 'Member', 'Recorded by', 'Source file'] : ['ID', '日期', '收支类型代码', '收支类型', '账户ID', '账户名称', '金额', '币种', '分类', '备注', '转账ID', '来源详情', '原始时间', '一级分类', '成员', '记账人', '来源文件'])
  transactions.addRows(snapshot.transactions.map(transaction => [
    transaction.id,
    parseDate(transaction.date),
    transaction.type,
    english ? (transaction.type === 'income' ? 'Income' : 'Expense') : (transaction.type === 'income' ? '收入' : '支出'),
    transaction.accountId,
    safeText(accountNames.get(transaction.accountId) ?? (english ? 'Unknown account' : '未知账户')),
    transaction.amount,
    transaction.currency,
    safeText(transaction.category),
    safeText(transaction.note ?? ''),
    transaction.transferId ?? '',
    transaction.source ? JSON.stringify(transaction.source) : '',
    transaction.source?.fields['日期'] ?? '',
    transaction.source?.fields['一级分类'] ?? '',
    transaction.source?.fields['成员'] ?? '',
    transaction.source?.fields['记账人'] ?? '',
    transaction.source?.fileName ?? '',
  ]))
  styleDataSheet(transactions, [10, 14, 16, 12, 12, 24, 18, 12, 18, 36, 36, 48, 24, 18, 18, 18, 30], 2, 7)

  const accounts = workbook.addWorksheet(english ? 'Accounts' : '账户')
  accounts.addRow(english ? ['ID', 'Name', 'Type code', 'Type', 'Currency', 'Balance', 'Sort order'] : ['ID', '名称', '类型代码', '类型', '币种', '余额', '排序'])
  accounts.addRows(snapshot.accounts.map(account => [
    account.id,
    safeText(account.name),
    account.type,
    english ? ACCOUNT_TYPE_LABELS_EN[account.type] : ACCOUNT_TYPE_LABELS[account.type],
    account.currency,
    account.balance,
    account.sortOrder,
  ]))
  styleDataSheet(accounts, [10, 24, 14, 16, 12, 18, 10], undefined, 6)

  const settings = workbook.addWorksheet(english ? 'Settings' : '设置')
  settings.addRow(english ? ['Setting key', 'Setting value', 'Description'] : ['设置键', '设置值', '说明'])
  settings.addRows([
    ['baseCurrency', snapshot.settings.baseCurrency, english ? 'Base currency used in summaries and reports' : '摘要与报表使用的基准币种'],
    ['masked', snapshot.settings.masked, english ? 'Whether amounts are hidden' : '是否隐藏金额'],
    ['theme', snapshot.settings.theme, english ? 'Interface theme' : '界面主题'],
    ['language', snapshot.settings.language, english ? 'Interface and export language' : '界面与导出语言'],
  ])
  styleDataSheet(settings, [24, 20, 42])

  const info = workbook.addWorksheet(english ? 'About' : '说明', { views: [{ showGridLines: false }] })
  info.mergeCells('A1:D1')
  info.getCell('A1').value = english ? `${PRODUCT_NAME} Data Backup` : `${PRODUCT_NAME}数据备份`
  info.getCell('A1').font = { bold: true, size: 18, color: { argb: HEADER_TEXT } }
  info.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
  info.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  info.getRow(1).height = 34
  info.addRows([
    [],
    english ? ['Item', 'Value'] : ['项目', '内容'],
    [english ? 'Backup format version' : '备份格式版本', BACKUP_FORMAT_VERSION],
    [english ? 'Database schema version' : '数据库结构版本', LEDGER_SCHEMA_VERSION],
    [english ? 'Exported at' : '导出时间', exportedAt.toISOString()],
    [english ? 'Account count' : '账户数量', snapshot.accounts.length],
    [english ? 'Transaction count' : '流水数量', snapshot.transactions.length],
    [english ? 'About' : '说明', english ? 'Accounts, transactions, and settings are stored in separate worksheets. Keep the original IDs for future restore or migration.' : '账户、流水和设置分别保存在对应工作表中。请保留原始 ID，便于后续恢复或迁移。'],
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

  workbook.views = [{ activeTab: 0, firstSheet: 0, x: 0, y: 0, width: 1200, height: 800, visibility: 'visible' }]
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
    snapshot.settings.language,
  )
}
