import { createTransfer } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseBody, transferInputSchema } from '../../utils/validation'

export default defineEventHandler(async event => {
  const input = await parseBody(event, transferInputSchema)
  return createTransfer(useLedgerDatabase(), input)
})
