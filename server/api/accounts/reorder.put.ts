import { reorderAccounts } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseBody, reorderSchema } from '../../utils/validation'

export default defineEventHandler(async event => {
  const { ids } = await parseBody(event, reorderSchema)
  return reorderAccounts(useLedgerDatabase(), ids)
})
