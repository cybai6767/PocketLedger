export type AccountType =
  | 'cash' | 'bank' | 'credit' | 'invest' | 'debt' | 'wallet' | 'other'

export type Currency = 'CNY' | 'HKD' | 'USD' | 'EUR' | 'USDT' | 'BTC'

export type TxType = 'income' | 'expense' | 'transfer'

export interface Account {
  id: number
  name: string
  type: AccountType
  currency: Currency
  balance: number      // 原币余额
}

export interface Transaction {
  id: number
  date: string
  type: TxType
  accountId: number
  amount: number       // 原币金额
  currency: Currency
  category: string
  note?: string
}

export interface Settings {
  baseCurrency: Currency
  masked: boolean
  theme: 'light' | 'dark'
}

export interface AppData {
  accounts: Account[]
  transactions: Transaction[]
  settings: Settings
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
  CNY: '¥', HKD: 'HK$', USD: '$', EUR: '€', USDT: 'USDT ', BTC: '₿',
}
