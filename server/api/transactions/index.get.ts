import { listTransactions } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'

export default defineEventHandler(() => listTransactions(useLedgerDatabase()))
