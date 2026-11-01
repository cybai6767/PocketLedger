import { z } from 'zod'

export const transactionSourceSchema = z.object({
  format: z.enum(['suishouji', 'pocketledger']),
  fileName: z.string().max(255),
  fileId: z.string().min(1).max(128),
  sheet: z.string().max(255),
  row: z.number().int().positive(),
  fields: z.record(z.string().max(80), z.string().max(10_000))
    .refine(fields => Object.keys(fields).length <= 100 && JSON.stringify(fields).length <= 64_000, '来源详情过长'),
}).strict()
