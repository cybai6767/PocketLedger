import type { LedgerBackup } from '../../../shared/types/ledger'
import { restoreLedger } from '../../utils/ledgerRepository'
import { useLedgerDatabase } from '../../utils/database'
import { ledgerBackupSchema, parseBody } from '../../utils/validation'

export default defineEventHandler(async event => {
  const backup = await parseBody(event, ledgerBackupSchema) as LedgerBackup
  return restoreLedger(useLedgerDatabase(), backup)
})
