import { z } from 'zod'
import { restoreLedger } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { ledgerBackupSchema, parseBody } from '../../utils/validation'

const schema = z.object({ backup: ledgerBackupSchema, expected: ledgerBackupSchema.shape.data }).strict()

export default defineEventHandler(async event => {
  const { backup, expected } = await parseBody(event, schema)
  return restoreLedger(useLedgerDatabase(), backup, expected)
})
