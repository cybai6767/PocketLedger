import { clearLedger } from '../utils/ledgerRepository'
import { useLedgerDatabase } from '../utils/database'

export default defineEventHandler(() => clearLedger(useLedgerDatabase()))
