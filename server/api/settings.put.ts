import { updateSettings } from '../utils/ledgerRepository'
import { useLedgerDatabase } from '../utils/database'
import { parseBody, settingsSchema } from '../utils/validation'

export default defineEventHandler(async event => {
  const settings = await parseBody(event, settingsSchema)
  return updateSettings(useLedgerDatabase(), settings)
})
