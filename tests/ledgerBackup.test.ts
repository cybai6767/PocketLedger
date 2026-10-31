import { describe, expect, it } from 'vitest'
import type { LedgerSnapshot } from '../shared/types/ledger'
import {
  createLedgerCsv,
  createLedgerJson,
  createLedgerXlsx,
  jsonBackupOpenOptions,
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
    expect(jsonBackupOpenOptions('zh-CN', true)).toEqual({ multiple: false, directory: false })
    expect(jsonBackupOpenOptions('zh-CN', false).filters?.[0]?.extensions).toEqual(['json'])
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

    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['说明', '账户', '流水', '设置'])
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
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['About', 'Accounts', 'Transactions', 'Settings'])
    expect(workbook.getWorksheet('Accounts')?.getCell('D2').value).toBe('Cash')
    expect(workbook.getWorksheet('Transactions')?.getCell('D2').value).toBe('Expense')
  })
})
