import { checkBalances } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'

export default defineEventHandler(() => checkBalances(useLedgerDatabase(), true))
