import { describe, expect, it } from 'vitest'
import type { LedgerSnapshot } from '../shared/types/ledger'
import { createLedgerCsv, createLedgerXlsx } from '../app/utils/ledgerBackup'

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
  settings: { baseCurrency: 'CNY', masked: false, theme: 'light' },
}

const exportedAt = new Date('2026-08-30T02:03:04.000Z')

describe('ledger backup exports', () => {
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
})
