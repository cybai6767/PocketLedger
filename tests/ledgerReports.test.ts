import { describe, expect, it } from 'vitest'
import type { Transaction } from '../shared/types/ledger'
import { buildMonthlyReport, buildYearReports, shiftMonth } from '../app/utils/ledgerReports'

const convert = (amount: number, currency: string) => currency === 'USD' ? amount * 7 : amount
const now = new Date(2026, 9, 15)
const transaction = (input: Partial<Transaction>): Transaction => ({
  id: 1, accountId: 1, date: '2026-10-10', type: 'expense', amount: 10, currency: 'CNY', category: '餐饮', ...input,
})

describe('monthly reports', () => {
  it('excludes transfers and other months while converting currencies and grouping daily spending', () => {
    const report = buildMonthlyReport([
      transaction({ type: 'income', amount: 1000 }),
      transaction({ amount: 100 }),
      transaction({ date: '2026-10-11', amount: 20, currency: 'USD', category: '购物' }),
      transaction({ type: 'income', amount: 500, transferId: 'transfer' }),
      transaction({ amount: 500, transferId: 'transfer' }),
      transaction({ date: '2026-09-01', amount: 9999 }),
    ], '2026-10', convert, now)
    expect(report).toMatchObject({ income: 1000, expense: 240, net: 760, expenseCount: 2, incomeCount: 1, averageDays: 15, averageExpense: 16, savingsRate: 76 })
    expect(report.categories.map(item => [item.name, item.amount])).toEqual([['购物', 140], ['餐饮', 100]])
    expect(report.categories.reduce((sum, item) => sum + item.percentage, 0)).toBeCloseTo(100)
    expect(report.peakDay).toMatchObject({ date: '2026-10-11', expense: 140, count: 1 })
    expect(report.days[9]).toMatchObject({ expense: 100, count: 1 })
  })

  it('keeps decimal totals exact and represents a deficit with no income without an infinite savings rate', () => {
    const report = buildMonthlyReport([transaction({ amount: 0.1 }), transaction({ amount: 0.2 })], '2026-10', convert, now)
    expect(report.expense).toBe(0.3)
    expect(report.net).toBe(-0.3)
    expect(report.savingsRate).toBeNull()
    expect(report.days[9]?.expense).toBe(0.3)
  })

  it('handles leap years, empty months, and full-month averages outside the current month', () => {
    const report = buildMonthlyReport([transaction({ date: '2024-02-29', amount: 290 })], '2024-02', convert, now)
    expect(report.days).toHaveLength(29)
    expect(report.averageDays).toBe(29)
    expect(report.averageExpense).toBe(10)
    const empty = buildMonthlyReport([], '2025-02', convert, now)
    expect(empty.days).toHaveLength(28)
    expect(empty).toMatchObject({ income: 0, expense: 0, net: 0, averageExpense: 0, peakDay: null, categories: [] })
  })

  it('retains every month of the selected year and navigates across year boundaries', () => {
    const reports = buildYearReports([
      transaction({ date: '2026-01-01', amount: 12 }),
      transaction({ date: '2026-12-31', type: 'income', amount: 300 }),
      transaction({ date: '2025-12-31', amount: 1000 }),
    ], 2026, convert, now)
    expect(reports).toHaveLength(12)
    expect(reports[0]).toMatchObject({ month: '2026-01', expense: 12, net: -12 })
    expect(reports[11]).toMatchObject({ month: '2026-12', income: 300, net: 300 })
    expect(reports.reduce((sum, report) => sum + report.expense, 0)).toBe(12)
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(() => buildMonthlyReport([], '2026-13', convert, now)).toThrow()
  })
})
