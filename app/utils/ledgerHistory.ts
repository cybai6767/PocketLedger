import Decimal from 'decimal.js'
import type { Transaction } from '../../shared/types/ledger'
import type { ConvertToBase } from './ledgerReports'

export interface HistoryTotals {
  income: number
  expense: number
  net: number
  count: number
}

export interface TransactionDayGroup extends HistoryTotals {
  date: string
  transactions: Transaction[]
}

export interface TransactionMonthGroup extends HistoryTotals {
  month: string
  days: TransactionDayGroup[]
}

function accumulator() {
  return { income: new Decimal(0), expense: new Decimal(0), count: 0 }
}

function totals(value: ReturnType<typeof accumulator>): HistoryTotals {
  return {
    income: value.income.toNumber(),
    expense: value.expense.toNumber(),
    net: value.income.minus(value.expense).toNumber(),
    count: value.count,
  }
}

export function buildTransactionHistory(transactions: readonly Transaction[], convert: ConvertToBase) {
  const sorted = [...transactions].sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
  const dayMap = new Map<string, ReturnType<typeof accumulator> & { date: string, transactions: Transaction[] }>()
  const monthMap = new Map<string, ReturnType<typeof accumulator> & { month: string, dates: string[] }>()
  const overall = accumulator()

  for (const transaction of sorted) {
    const month = transaction.date.slice(0, 7)
    if (!monthMap.has(month)) monthMap.set(month, { ...accumulator(), month, dates: [] })
    const monthGroup = monthMap.get(month)!
    if (!dayMap.has(transaction.date)) {
      dayMap.set(transaction.date, { ...accumulator(), date: transaction.date, transactions: [] })
      monthGroup.dates.push(transaction.date)
    }
    const day = dayMap.get(transaction.date)!
    day.transactions.push(transaction)
    const amount = transaction.transferId ? null : new Decimal(convert(transaction.amount, transaction.currency))
    for (const target of [day, monthGroup, overall]) {
      target.count++
      if (amount !== null) {
        target[transaction.type] = target[transaction.type].plus(amount)
      }
    }
  }

  const days: TransactionDayGroup[] = [...dayMap.values()].map(day => ({
    date: day.date, transactions: day.transactions, ...totals(day),
  }))
  const daysByDate = new Map(days.map(day => [day.date, day]))
  const months: TransactionMonthGroup[] = [...monthMap.values()].map(month => ({
    month: month.month, days: month.dates.map(date => daysByDate.get(date)!), ...totals(month),
  }))
  return { days, recentDays: days.slice(0, 8), months, ...totals(overall) }
}
