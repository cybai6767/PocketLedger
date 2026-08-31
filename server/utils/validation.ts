import type { H3Event } from 'h3'
import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  ACCOUNT_TYPES,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENCIES,
  LEDGER_SCHEMA_VERSION,
  TX_TYPES,
} from '../../shared/types/ledger'

const money = z.number()
  .finite('金额必须是有效数字')
  .min(-1_000_000_000_000, '金额超出允许范围')
  .max(1_000_000_000_000, '金额超出允许范围')

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, '账户名不能为空').max(80, '账户名不能超过 80 个字符'),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  balance: money,
}).strict()

export const transactionInputSchema = z.object({
  date: z.iso.date('日期格式必须为 YYYY-MM-DD'),
  type: z.enum(TX_TYPES),
  accountId: z.number().int().positive('必须指定有效账户'),
  amount: money.positive('金额必须大于 0'),
  category: z.string().trim().min(1, '分类不能为空').max(40, '分类不能超过 40 个字符'),
  note: z.string().trim().max(200, '备注不能超过 200 个字符').optional(),
}).strict()

export const transferInputSchema = z.object({
  date: z.iso.date('日期格式必须为 YYYY-MM-DD'),
  fromAccountId: z.number().int().positive('必须指定转出账户'),
  toAccountId: z.number().int().positive('必须指定转入账户'),
  amount: money.positive('金额必须大于 0'),
  note: z.string().trim().max(200, '备注不能超过 200 个字符').optional(),
}).strict().refine(input => input.fromAccountId !== input.toAccountId, {
  message: '转出账户和转入账户不能相同',
})

export const settingsSchema = z.object({
  baseCurrency: z.enum(CURRENCIES),
  masked: z.boolean(),
  theme: z.enum(['light', 'dark']),
}).strict()

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).max(500),
}).strict()

const restoredAccountSchema = accountInputSchema.extend({
  id: z.number().int().positive(),
  sortOrder: z.number().int().min(0).max(100_000),
}).strict()

const restoredTransactionSchema = z.object({
  id: z.number().int().positive(),
  date: z.iso.date('日期格式必须为 YYYY-MM-DD'),
  type: z.enum(TX_TYPES),
  accountId: z.number().int().positive('流水引用了无效账户'),
  amount: money.positive('金额必须大于 0'),
  currency: z.enum(CURRENCIES),
  category: z.string().trim().min(1, '分类不能为空').max(40, '分类不能超过 40 个字符'),
  note: z.string().trim().max(200, '备注不能超过 200 个字符').optional(),
  transferId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
}).strict()

export const ledgerBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION, '备份格式版本不受支持'),
  schemaVersion: z.number().int().min(1).max(
    LEDGER_SCHEMA_VERSION,
    '备份数据库版本高于当前程序支持的版本，请升级应用后再恢复',
  ),
  exportedAt: z.iso.datetime({ offset: true }),
  data: z.object({
    accounts: z.array(restoredAccountSchema).max(10_000, '账户数量过多'),
    transactions: z.array(restoredTransactionSchema).max(1_000_000, '流水数量过多'),
    settings: settingsSchema,
  }).strict(),
}).strict().superRefine((backup, context) => {
  const accountIds = new Set<number>()
  const transactionIds = new Set<number>()
  for (const account of backup.data.accounts) {
    if (accountIds.has(account.id)) {
      context.addIssue({ code: 'custom', path: ['data', 'accounts'], message: `账户 ID ${account.id} 重复` })
    }
    accountIds.add(account.id)
  }
  for (const transaction of backup.data.transactions) {
    if (transactionIds.has(transaction.id)) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `流水 ID ${transaction.id} 重复` })
    }
    transactionIds.add(transaction.id)
    const account = backup.data.accounts.find(item => item.id === transaction.accountId)
    if (!account) {
      context.addIssue({ code: 'custom', path: ['data', 'transactions'], message: `流水 ${transaction.id} 引用了不存在的账户` })
    }
    else if (account.currency !== transaction.currency) {
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
      context.addIssue({
        code: 'custom',
        path: ['data', 'transactions'],
        message: `转账 ${transferId} 的两条流水不完整或不一致`,
      })
    }
  }
})

export async function parseBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readBody(event))
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: '请求参数无效',
      data: { message: result.error.issues[0]?.message ?? '请求参数无效' },
    })
  }
  return result.data
}

export function parseId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'ID 无效' })
  }
  return id
}
