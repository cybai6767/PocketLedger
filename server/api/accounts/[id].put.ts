import { updateAccount } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { accountInputSchema, parseBody, parseId } from '../../utils/validation'

export default defineEventHandler(async event => {
  const id = parseId(event)
  const input = await parseBody(event, accountInputSchema)
  return updateAccount(useLedgerDatabase(), id, input)
})
