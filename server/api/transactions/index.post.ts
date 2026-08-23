import { createTransaction } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseBody, transactionInputSchema } from '../../utils/validation'

export default defineEventHandler(async event => {
  const input = await parseBody(event, transactionInputSchema)
  return createTransaction(useLedgerDatabase(), input)
})
