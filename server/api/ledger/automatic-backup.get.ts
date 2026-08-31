import type { LedgerBackup } from '../../../shared/types/ledger'
import { useLedgerDatabase } from '../../utils/database'
import { readLatestAutomaticBackup } from '../../utils/ledgerRepository'
import { ledgerBackupSchema } from '../../utils/validation'

export default defineEventHandler(() => {
  const backup = readLatestAutomaticBackup(useLedgerDatabase())
  if (!backup) return null
  return ledgerBackupSchema.parse(backup) as LedgerBackup
})
