export const ACCOUNT_TYPES = [
  'cash', 'bank', 'credit', 'invest', 'debt', 'wallet', 'other',
] as const

export const CURRENCIES = ['CNY', 'HKD', 'USD', 'EUR', 'USDT', 'BTC'] as const
export const TX_TYPES = ['income', 'expense'] as const

export const LEDGER_SCHEMA_VERSION = 1
export const BACKUP_FORMAT_VERSION = 1

export type AccountType = (typeof ACCOUNT_TYPES)[number]
export type Currency = (typeof CURRENCIES)[number]
export type TxType = (typeof TX_TYPES)[number]

export interface Account {
  id: number
  name: string
  type: AccountType
  currency: Currency
  balance: number
  sortOrder: number
}

export interface AccountInput {
  name: string
  type: AccountType
  currency: Currency
  balance: number
}

export interface Transaction {
  id: number
  date: string
  type: TxType
  accountId: number
  amount: number
  currency: Currency
  category: string
  note?: string
}

export interface TransactionInput {
  date: string
  type: TxType
  accountId: number
  amount: number
  category: string
  note?: string
}

export interface Settings {
  baseCurrency: Currency
  masked: boolean
  theme: 'light' | 'dark'
}

export interface LedgerSnapshot {
  accounts: Account[]
  transactions: Transaction[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'CNY',
  masked: false,
  theme: 'light',
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: '现金',
  bank: '银行卡',
  credit: '信用卡',
  invest: '理财/投资',
  debt: '负债/贷款',
  wallet: '钱包/平台',
  other: '其他',
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  CNY: 'CNY (¥)',
  HKD: 'HKD (HK$)',
  USD: 'USD ($)',
  EUR: 'EUR (€)',
  USDT: 'USDT',
  BTC: 'BTC (₿)',
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '¥',
  HKD: 'HK$',
  USD: '$',
  EUR: '€',
  USDT: 'USDT ',
  BTC: '₿',
}
