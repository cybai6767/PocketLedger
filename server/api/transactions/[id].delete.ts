import { deleteTransaction } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { parseId } from '../../utils/validation'

export default defineEventHandler(event => {
  return deleteTransaction(useLedgerDatabase(), parseId(event))
})
