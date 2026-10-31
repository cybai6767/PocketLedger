import Decimal from 'decimal.js'
import type { Currency, Transaction } from '../../shared/types/ledger'

export type ConvertToBase = (amount: number, currency: Currency) => number

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthParts(month: string): [number, number] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1) {
    throw new Error('Invalid report month')
  }
  return [Number(month.slice(0, 4)), Number(month.slice(5))]
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = monthParts(month)
  const index = year * 12 + number - 1 + offset
  const nextYear = Math.floor(index / 12)
  if (!Number.isInteger(offset) || nextYear < 1 || nextYear > 9999) throw new Error('Invalid report month')
  return `${String(nextYear).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}

export function buildMonthlyReport(
  transactions: readonly Transaction[],
  month: string,
  convert: ConvertToBase,
  now = new Date(),
) {
  const [year, number] = monthParts(month)
  const end = new Date(0)
  end.setUTCFullYear(year, number, 0)
  const dayCount = end.getUTCDate()
  const averageDays = month === monthKey(now) ? Math.min(now.getDate(), dayCount) : dayCount
  const days = Array.from({ length: dayCount }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, '0')}`,
    day: index + 1,
    expense: new Decimal(0),
    count: 0,
  }))
  const categories = new Map<string, { amount: Decimal, count: number }>()
  let income = new Decimal(0)
  let expense = new Decimal(0)
  let incomeCount = 0
  let expenseCount = 0

  for (const transaction of transactions) {
    if (transaction.transferId || !transaction.date.startsWith(`${month}-`)) continue
    const day = days[Number(transaction.date.slice(8, 10)) - 1]
    if (!day || transaction.date !== day.date) continue
    const amount = new Decimal(convert(transaction.amount, transaction.currency))
    if (transaction.type === 'income') {
      income = income.plus(amount)
      incomeCount++
    }
    else {
      expense = expense.plus(amount)
      expenseCount++
      day.expense = day.expense.plus(amount)
      day.count++
      const category = categories.get(transaction.category) ?? { amount: new Decimal(0), count: 0 }
      category.amount = category.amount.plus(amount)
      category.count++
      categories.set(transaction.category, category)
    }
  }

  const net = income.minus(expense)
  const daily = days.map(day => ({ ...day, expense: day.expense.toNumber() }))
  const peakDay = daily.reduce<(typeof daily)[number] | null>(
    (peak, day) => day.expense > (peak?.expense ?? 0) ? day : peak,
    null,
  )
  return {
    month,
    income: income.toNumber(),
    expense: expense.toNumber(),
    net: net.toNumber(),
    incomeCount,
    expenseCount,
    averageDays,
    averageExpense: expense.dividedBy(averageDays).toNumber(),
    savingsRate: income.isZero() ? null : net.dividedBy(income).times(100).toNumber(),
    days: daily,
    peakDay,
    categories: [...categories.entries()]
      .map(([name, value]) => ({
        name,
        amount: value.amount.toNumber(),
        count: value.count,
        percentage: expense.isZero() ? 0 : value.amount.dividedBy(expense).times(100).toNumber(),
      }))
      .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name)),
  }
}

export function buildYearReports(transactions: readonly Transaction[], year: number, convert: ConvertToBase, now = new Date()) {
  return Array.from({ length: 12 }, (_, index) =>
    buildMonthlyReport(transactions, `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`, convert, now),
  )
}
