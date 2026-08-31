import { updateTransaction } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseBody, parseId, transactionInputSchema } from '../../utils/validation'

export default defineEventHandler(async event => {
  const input = await parseBody(event, transactionInputSchema)
  return updateTransaction(useLedgerDatabase(), parseId(event), input)
})
