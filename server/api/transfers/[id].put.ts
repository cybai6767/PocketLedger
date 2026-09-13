import { updateTransfer } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseBody, parseId, transferInputSchema } from '../../utils/validation'

export default defineEventHandler(async event => {
  const input = await parseBody(event, transferInputSchema)
  return updateTransfer(useLedgerDatabase(), parseId(event), input)
})
