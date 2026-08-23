import { createAccount } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { accountInputSchema, parseBody } from '../../utils/validation'

export default defineEventHandler(async event => {
  const input = await parseBody(event, accountInputSchema)
  return createAccount(useLedgerDatabase(), input)
})
