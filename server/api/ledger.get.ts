import { getSnapshot } from '../utils/ledgerRepository'
import { useLedgerDatabase } from '../utils/database'

export default defineEventHandler(() => getSnapshot(useLedgerDatabase()))
