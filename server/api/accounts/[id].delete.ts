import { deleteAccount } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseId } from '../../utils/validation'

export default defineEventHandler(event => {
  deleteAccount(useLedgerDatabase(), parseId(event))
  return { ok: true }
})
