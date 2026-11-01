import { describe, expect, it } from 'vitest'
import type { Language, LedgerSnapshot } from '../shared/types/ledger'
import { buildMonthlyReport } from '../app/utils/ledgerReports'
import {
  createLedgerCsv,
  createLedgerJson,
  createLedgerXlsx,
  jsonBackupOpenOptions,
  mergeLedgerBackups,
  parseLedgerBackupBytes,
  parseLedgerJson,
} from '../app/utils/ledgerBackup'

const snapshot: LedgerSnapshot = {
  accounts: [
    { id: 1, name: '=测试账户', type: 'cash', currency: 'CNY', balance: 1234.56, sortOrder: 0 },
  ],
  transactions: [
    {
      id: 8,
      accountId: 1,
      date: '2026-08-30',
      type: 'expense',
      amount: 12.34,
      currency: 'CNY',
      category: '餐饮',
      note: '午餐',
    },
  ],
  settings: { baseCurrency: 'CNY', masked: false, theme: 'light', language: 'zh-CN' },
}

const exportedAt = new Date('2026-08-30T02:03:04.000Z')

function transferSnapshot(amount = 50, date = '2026-08-30', language: Language = 'zh-CN'): LedgerSnapshot {
  return {
    accounts: [
      { id: 1, name: '银行卡', type: 'bank', currency: 'CNY', balance: 1000 - amount, sortOrder: 0 },
      { id: 2, name: '现金', type: 'cash', currency: 'CNY', balance: amount, sortOrder: 1 },
    ],
    transactions: [
      { id: 1, accountId: 1, date, type: 'expense', amount, currency: 'CNY', category: '转账', transferId: 'a'.repeat(32) },
      { id: 2, accountId: 2, date, type: 'income', amount, currency: 'CNY', category: '转账', transferId: 'a'.repeat(32) },
    ],
    settings: { ...snapshot.settings, language },
  }
}

describe('ledger backup exports', () => {
  it('round-trips a complete JSON backup without losing IDs or settings', () => {
    const json = createLedgerJson(snapshot, exportedAt)
    const preview = parseLedgerJson(json)

    expect(preview.exportedAt).toBe(exportedAt.toISOString())
    expect(preview.accountCount).toBe(1)
    expect(preview.transactionCount).toBe(1)
    expect(preview.backup.data).toEqual(snapshot)
  })

  it('accepts backups that store empty notes as null', () => {
    const value = JSON.parse(createLedgerJson(snapshot, exportedAt)) as {
      data: { transactions: Array<Record<string, unknown>> }
    }
    value.data.transactions[0]!.note = null
    value.data.transactions[0]!.transferId = null

    const preview = parseLedgerJson(JSON.stringify(value))

    expect(preview.backup.data.transactions[0]?.note).toBeUndefined()
    expect(preview.backup.data.transactions[0]?.transferId).toBeUndefined()
    expect(preview.accountCount).toBe(1)
  })

  it('lists every file on Android so JSON backups are not hidden by MIME type', () => {
    expect(jsonBackupOpenOptions('zh-CN', true)).toEqual({ multiple: true, directory: false })
    expect(jsonBackupOpenOptions('zh-CN', false).filters?.[0]?.extensions).toEqual(['json', 'xlsx', 'csv'])
  })

  it('defaults old JSON backups without a language field to Simplified Chinese', () => {
    const value = JSON.parse(createLedgerJson(snapshot, exportedAt))
    delete value.data.settings.language

    expect(parseLedgerJson(JSON.stringify(value)).backup.data.settings.language).toBe('zh-CN')
  })

  it('rejects backups with broken account references before restoring', () => {
    const value = JSON.parse(createLedgerJson(snapshot, exportedAt))
    value.data.transactions[0].accountId = 999

    expect(() => parseLedgerJson(JSON.stringify(value))).toThrow('引用了不存在的账户')
  })

  it('rejects backups from a newer database version', () => {
    const value = JSON.parse(createLedgerJson(snapshot, exportedAt))
    value.schemaVersion = 999

    expect(() => parseLedgerJson(JSON.stringify(value))).toThrow('数据库版本过新')
  })

  it('creates a UTF-8 CSV containing all ledger record types', () => {
    const csv = createLedgerCsv(snapshot, exportedAt)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"元数据"')
    expect(csv).toContain('"账户"')
    expect(csv).toContain('"流水"')
    expect(csv).toContain('"设置"')
    expect(csv).toContain('"\'=测试账户"')
  })

  it('creates a readable workbook with separate backup sheets', { timeout: 15_000 }, async () => {
    const ExcelJS = (await import('exceljs')).default
    const bytes = await createLedgerXlsx(snapshot, exportedAt)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(bytes))

    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['流水', '账户', '设置', '说明'])
    expect(workbook.getWorksheet('账户')?.getCell('B2').value).toBe("'=测试账户")
    expect(workbook.getWorksheet('账户')?.getCell('F2').value).toBe(1234.56)
    expect(workbook.getWorksheet('账户')?.getRow(1).fill).toBeUndefined()
    expect(workbook.getWorksheet('账户')?.getCell('A1').fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
    })
    expect((workbook.getWorksheet('流水')?.getCell('B2').value as Date).toISOString()).toBe('2026-08-30T00:00:00.000Z')
    expect(workbook.getWorksheet('流水')?.getCell('D2').value).toBe('支出')
    expect(workbook.getWorksheet('流水')?.getCell('G2').value).toBe(12.34)
    expect(workbook.getWorksheet('设置')?.getCell('B2').value).toBe('CNY')
  })

  it('uses English labels in CSV and Excel when English is selected', { timeout: 15_000 }, async () => {
    const englishSnapshot: LedgerSnapshot = {
      ...snapshot,
      settings: { ...snapshot.settings, language: 'en' },
    }
    const csv = createLedgerCsv(englishSnapshot, exportedAt)
    expect(csv).toContain('"Record type"')
    expect(csv).toContain('"Account"')
    expect(csv).toContain('"Cash"')

    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await createLedgerXlsx(englishSnapshot, exportedAt)))
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Transactions', 'Accounts', 'Settings', 'About'])
    expect(workbook.getWorksheet('Accounts')?.getCell('D2').value).toBe('Cash')
    expect(workbook.getWorksheet('Transactions')?.getCell('D2').value).toBe('Expense')
  })

  it('restores a PocketLedger CSV without dropping the stored balance', async () => {
    const preview = await parseLedgerBackupBytes(
      new TextEncoder().encode(createLedgerCsv(snapshot, exportedAt)),
      'PocketLedger-backup.csv',
      'zh-CN',
      snapshot.settings,
    )

    expect(preview.exportedAt).toBe(exportedAt.toISOString())
    expect(preview.backup.data).toEqual(snapshot)
  })

  it('restores a PocketLedger workbook', { timeout: 15_000 }, async () => {
    const preview = await parseLedgerBackupBytes(
      await createLedgerXlsx(snapshot, exportedAt),
      'PocketLedger-backup.xlsx',
      'zh-CN',
      snapshot.settings,
    )

    expect(preview.backup.data).toEqual(snapshot)
  })

  it('restores a Suishouji workbook and derives account balances from its rows', { timeout: 15_000 }, async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const expense = workbook.addWorksheet('支出')
    expense.addRow(['交易类型', '日期', '一级分类', '二级分类', '支出账户', '账户币种', '金额', '成员', '商家', '项目分类', '项目', '记账人', '备注'])
    expense.addRow(['支出', '2026-01-02 08:00:00', '饮食', '早餐', '现金', 'CNY', 12, '', '', '', '', '', '豆浆'])
    expense.addRow(['支出', '2026-01-03 12:00:00', '饮食', '午餐', '微信钱包', 'CNY', 30, 'hidden-member', '食堂', '', '', 'hidden-member', '套餐'])
    const income = workbook.addWorksheet('收入')
    income.addRow(['交易类型', '日期', '一级分类', '二级分类', '收入账户', '账户币种', '金额', '成员', '商家', '项目分类', '项目', '记账人', '备注'])
    income.addRow(['收入', '2026-01-01 09:00:00', '收入', '工资', '银行卡', 'CNY', 100, '', '', '', '', '', ''])
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())

    const preview = await parseLedgerBackupBytes(bytes, 'suishouji.xlsx', 'zh-CN', snapshot.settings)

    expect(preview.sourceLabel).toBe('随手记表格')
    expect(preview.accountCount).toBe(3)
    expect(preview.backup.data.accounts).toEqual([
      { id: 1, name: '银行卡', type: 'bank', currency: 'CNY', balance: 100, sortOrder: 0 },
      { id: 2, name: '现金', type: 'cash', currency: 'CNY', balance: -12, sortOrder: 1 },
      { id: 3, name: '微信钱包', type: 'wallet', currency: 'CNY', balance: -30, sortOrder: 2 },
    ])
    expect(preview.backup.data.transactions.map(item => [item.date, item.category, item.note, item.accountId])).toEqual([
      ['2026-01-01', '工资', undefined, 1],
      ['2026-01-02', '早餐', '豆浆', 2],
      ['2026-01-03', '午餐', '套餐 · 食堂', 3],
    ])
    expect(preview.backup.data.transactions[2]?.note).not.toContain('hidden-member')
    expect(preview.backup.data.transactions[2]?.source?.fields).toMatchObject({ 成员: 'hidden-member', 记账人: 'hidden-member' })
  })

  it('merges several selected backups and keeps duplicate rows inside one file', { timeout: 15_000 }, async () => {
    const ExcelJS = (await import('exceljs')).default
    async function workbook(rows: Array<Array<string | number>>) {
      const book = new ExcelJS.Workbook()
      const sheet = book.addWorksheet('支出')
      sheet.addRow(['交易类型', '日期', '一级分类', '二级分类', '支出账户', '账户币种', '金额', '成员', '商家', '项目分类', '项目', '记账人', '备注'])
      for (const row of rows) sheet.addRow(row)
      return parseLedgerBackupBytes(new Uint8Array(await book.xlsx.writeBuffer()), 'suishouji.xlsx', 'zh-CN', snapshot.settings)
    }

    const first = await workbook([
      ['支出', '2026-01-02 08:00:00', '饮食', '早餐', '现金', 'CNY', 5, '', '', '', '', '', '豆浆'],
      ['支出', '2026-01-02 08:00:00', '饮食', '早餐', '现金', 'CNY', 5, '', '', '', '', '', '豆浆'],
    ])
    const second = await workbook([
      ['支出', '2026-02-01 08:00:00', '饮食', '早餐', '现金', 'CNY', 8, '', '', '', '', '', '包子'],
      ['支出', '2026-01-02 08:00:00', '饮食', '早餐', '现金', 'CNY', 5, '', '', '', '', '', '豆浆'],
    ])
    const merged = mergeLedgerBackups([first, second], 'zh-CN')

    expect(merged.sourceLabel).toBe('随手记表格 · 2 个文件')
    expect(merged.accountCount).toBe(1)
    expect(merged.backup.data.accounts[0]).toMatchObject({ name: '现金', type: 'cash', balance: -18 })
    expect(merged.transactionCount).toBe(3)
    expect(mergeLedgerBackups([first], 'zh-CN')).toBe(first)
  })
})

describe('restorable transfer relationships', () => {
  it.each(['zh-CN', 'en'] as const)('preserves linked transfers in a %s CSV round trip', async language => {
    const data = transferSnapshot(50, '2026-08-30', language)
    const preview = await parseLedgerBackupBytes(new TextEncoder().encode(createLedgerCsv(data, exportedAt)), 'backup.csv', language)
    expect(preview.backup.data).toEqual(data)
  })

  it.each(['zh-CN', 'en'] as const)('preserves linked transfers in a %s Excel round trip', async language => {
    const data = transferSnapshot(50, '2026-08-30', language)
    const preview = await parseLedgerBackupBytes(await createLedgerXlsx(data, exportedAt), 'backup.xlsx', language)
    expect(preview.backup.data).toEqual(data)
  })

  it('deduplicates overlapping backup transfers as complete pairs', () => {
    const preview = parseLedgerJson(createLedgerJson(transferSnapshot(), exportedAt))
    const merged = mergeLedgerBackups([preview, preview])
    expect(merged.transactionCount).toBe(2)
    expect(merged.backup.data.transactions.every(item => Boolean(item.transferId))).toBe(true)
    expect(merged.backup.data.accounts.map(account => account.balance)).toEqual([950, 50])
    expect(buildMonthlyReport(merged.backup.data.transactions, '2026-08', amount => amount)).toMatchObject({ income: 0, expense: 0, net: 0 })
  })

  it('remaps colliding transfer IDs without mixing different pairs', () => {
    const first = parseLedgerJson(createLedgerJson(transferSnapshot(), exportedAt))
    const second = parseLedgerJson(createLedgerJson(transferSnapshot(60, '2026-09-01'), exportedAt))
    const merged = mergeLedgerBackups([first, second])
    expect(merged.transactionCount).toBe(4)
    expect(new Set(merged.backup.data.transactions.map(item => item.transferId)).size).toBe(2)
    expect(merged.backup.data.accounts.map(account => account.balance)).toEqual([890, 110])
    expect(() => parseLedgerJson(JSON.stringify(merged.backup))).not.toThrow()
    expect(buildMonthlyReport(merged.backup.data.transactions, '2026-09', amount => amount)).toMatchObject({ income: 0, expense: 0 })
  })

  it('keeps an ordinary transaction even when its fields match a transfer leg', () => {
    const data = transferSnapshot()
    const expense = { ...data.transactions[0]! }
    delete expense.transferId
    const ordinary: LedgerSnapshot = { ...data, accounts: [data.accounts[0]!], transactions: [{ ...expense, id: 3 }] }
    const merged = mergeLedgerBackups([
      parseLedgerJson(createLedgerJson(data, exportedAt)),
      parseLedgerJson(createLedgerJson(ordinary, exportedAt)),
    ])
    expect(merged.transactionCount).toBe(3)
    expect(buildMonthlyReport(merged.backup.data.transactions, '2026-08', amount => amount)).toMatchObject({ income: 0, expense: 50, net: -50 })
  })
})
