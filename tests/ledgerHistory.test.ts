import { describe, expect, it } from 'vitest'
import type { Transaction } from '../shared/types/ledger'
import { buildTransactionHistory } from '../app/utils/ledgerHistory'

const convert = (amount: number, currency: string) => currency === 'USD' ? amount * 7 : amount
const transaction = (input: Partial<Transaction>): Transaction => ({
  id: 1, accountId: 1, date: '2026-10-10', type: 'expense', amount: 10, currency: 'CNY', category: '餐饮', ...input,
})

describe('transaction history', () => {
  it('shows eight recorded dates rather than eight rows or a calendar-day cutoff, without changing source order', () => {
    const input = Object.freeze([
      ...Array.from({ length: 12 }, (_, index) => transaction({ id: index + 1, date: `2026-10-${String(index + 1).padStart(2, '0')}` })),
      transaction({ id: 99, date: '2026-10-12' }),
    ])
    const history = buildTransactionHistory(input, convert)
    expect(history.recentDays.map(day => day.date)).toEqual([
      '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09',
      '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05',
    ])
    expect(history.recentDays.flatMap(day => day.transactions)).toHaveLength(9)
    expect(history.days[0]?.transactions.map(item => item.id)).toEqual([99, 12])
    expect(history.days).toHaveLength(12)
    expect(input[0]?.id).toBe(1)
    expect(input[12]?.id).toBe(99)
  })

  it('orders months across years and keeps converted decimal totals consistent at every level', () => {
    const history = buildTransactionHistory([
      transaction({ id: 1, date: '2025-12-31', amount: 10 }),
      transaction({ id: 2, date: '2026-01-03', amount: 0.1 }),
      transaction({ id: 3, date: '2026-01-03', amount: 0.2 }),
      transaction({ id: 4, date: '2026-01-01', type: 'income', amount: 20, currency: 'USD' }),
    ], convert)
    expect(history.months.map(month => month.month)).toEqual(['2026-01', '2025-12'])
    expect(history.months[0]).toMatchObject({ income: 140, expense: 0.3, net: 139.7, count: 3 })
    expect(history.months[0]?.days.map(day => day.date)).toEqual(['2026-01-03', '2026-01-01'])
    expect(history.days[0]).toMatchObject({ income: 0, expense: 0.3, net: -0.3, count: 2 })
    expect(history).toMatchObject({ income: 140, expense: 10.3, net: 129.7, count: 4 })
  })

  it('retains both transfer legs in details but excludes even a filtered single leg from income and expenses', () => {
    const input = [
      transaction({ id: 1, accountId: 1, amount: 100, transferId: 'transfer' }),
      transaction({ id: 2, accountId: 2, type: 'income', amount: 100, transferId: 'transfer' }),
      transaction({ id: 3, accountId: 2, type: 'income', amount: 10 }),
    ]
    const history = buildTransactionHistory(input, convert)
    expect(history).toMatchObject({ income: 10, expense: 0, net: 10, count: 3 })
    expect(history.days[0]?.transactions).toHaveLength(3)
    const account = buildTransactionHistory(input.filter(item => item.accountId === 2), convert)
    expect(account.months[0]).toMatchObject({ income: 10, expense: 0, net: 10, count: 2 })
    const transferOnly = buildTransactionHistory(input.filter(item => item.id === 1), convert)
    expect(transferOnly.months[0]).toMatchObject({ income: 0, expense: 0, net: 0, count: 1 })
  })

  it('returns a usable empty history for an empty ledger or unmatched filters', () => {
    expect(buildTransactionHistory([], convert)).toEqual({
      days: [], recentDays: [], months: [], income: 0, expense: 0, net: 0, count: 0,
    })
  })
})
