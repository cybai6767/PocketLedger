import type { H3Event } from 'h3'
import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { ACCOUNT_TYPES, CURRENCIES, TX_TYPES } from '../../shared/types/ledger'

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

export const settingsSchema = z.object({
  baseCurrency: z.enum(CURRENCIES),
  masked: z.boolean(),
  theme: z.enum(['light', 'dark']),
}).strict()

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).max(500),
}).strict()

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
