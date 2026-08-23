import { listAccounts } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'

export default defineEventHandler(() => listAccounts(useLedgerDatabase()))
