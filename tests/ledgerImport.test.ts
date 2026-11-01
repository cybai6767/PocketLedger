import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, DEFAULT_SETTINGS, LEDGER_SCHEMA_VERSION, type LedgerSnapshot } from '../shared/types/ledger'
import { snapshotIdentity } from '../shared/utils/ledgerSnapshot'
import { createLedgerCsv, createLedgerJson, createLedgerXlsx, parseLedgerBackupBytes, parseLedgerJson } from '../app/utils/ledgerBackup'
import { importAccountMappings, prepareLedgerImport } from '../app/utils/ledgerImport'
import { openLedgerDatabase } from '../server/utils/database'
import { getSnapshot, restoreLedger, updateSettings } from '../server/utils/ledgerRepository'
import { ledgerBackupSchema } from '../server/utils/validation'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/import-workflow.json', import.meta.url), 'utf8')) as { initial: LedgerSnapshot, imported: LedgerSnapshot }
const empty = (): LedgerSnapshot => ({ accounts: [], transactions: [], settings: { ...DEFAULT_SETTINGS } })
const backup = (data: LedgerSnapshot) => parseLedgerJson(createLedgerJson(data)).backup
const csv = (time: string, amount = '12.34') => new TextEncoder().encode(`交易类型,日期,一级分类,二级分类,支出账户,账户币种,金额,成员,记账人,备注\n支出,${time},饮食,早餐,现金,CNY,${amount},测试成员,测试用户,原始备注`)

describe('shared append-import rules', () => {
  it('keeps existing data, balance and preferences; preserves original fields and detects re-import', async () => {
    const preview = await parseLedgerBackupBytes(csv('2025-12-30 09:12:34'), '历史账单.csv')
    const original = structuredClone(fixture.initial)
    const mappings = importAccountMappings(original, [preview])
    const plan = prepareLedgerImport(original, [preview], mappings)
    expect(plan.added).toBe(1)
    expect(plan.backup.data.accounts).toEqual(original.accounts)
    expect(plan.backup.data.settings).toEqual(original.settings)
    expect(plan.backup.data.transactions.at(-1)?.source?.fields).toMatchObject({ 日期: '2025-12-30 09:12:34', 一级分类: '饮食', 成员: '测试成员' })
    expect(original).toEqual(fixture.initial)
    const again = prepareLedgerImport(plan.backup.data, [preview], importAccountMappings(plan.backup.data, [preview]))
    expect(again.added).toBe(0)
    expect(again.alreadyImported).toBe(1)
  })

  it('does not collapse legitimate same-day same-amount entries at different known times', async () => {
    const files = await Promise.all(['09:00:00', '18:00:00'].map(time => parseLedgerBackupBytes(csv(`2026-01-02 ${time}`), `${time}.csv`)))
    const plan = prepareLedgerImport(empty(), files, importAccountMappings(empty(), files))
    expect(plan.added).toBe(2)
    expect(plan.suspected).toHaveLength(0)
    expect(plan.backup.data.accounts[0]?.balance).toBe(0)
  })

  it('lets users review and skip a possible duplicate of an older entry without silently deleting it', async () => {
    const preview = await parseLedgerBackupBytes(csv('2025-12-30 09:12:34'), '历史.csv')
    const current = structuredClone(fixture.imported)
    delete current.transactions[1]!.source
    current.transactions[1]!.note = '原始备注'
    const mappings = importAccountMappings(current, [preview])
    const plan = prepareLedgerImport(current, [preview], mappings)
    expect(plan.suspected).toHaveLength(1)
    expect(plan.added).toBe(1)
    const skip = prepareLedgerImport(current, [preview], mappings, [plan.suspected[0]!.key])
    expect(skip.added).toBe(0)
    expect(skip.backup.data.transactions).toEqual(current.transactions)
  })

  it('only changes an existing balance when that policy is explicitly selected', async () => {
    const preview = await parseLedgerBackupBytes(csv('2026-01-02 09:00:00'), '历史.csv')
    const mappings = importAccountMappings(fixture.initial, [preview])
    mappings[0]!.affectBalance = true
    expect(prepareLedgerImport(fixture.initial, [preview], mappings).backup.data.accounts[0]?.balance).toBe(87.66)
  })

  it('retains repeated rows within one file; treats a second copy of that file as already imported', async () => {
    const line = '支出,2026-01-02 09:00:00,饮食,早餐,现金,CNY,12.34,测试成员,测试用户,原始备注'
    const bytes = new TextEncoder().encode(new TextDecoder().decode(csv('2026-01-02 09:00:00')) + '\n' + line)
    const first = await parseLedgerBackupBytes(bytes, 'a.csv')
    const copy = await parseLedgerBackupBytes(bytes, 'copy.csv')
    const plan = prepareLedgerImport(empty(), [first, copy], importAccountMappings(empty(), [first, copy]))
    expect(plan.added).toBe(2)
    expect(plan.alreadyImported).toBe(2)
    expect(plan.suspected).toHaveLength(1)
  })

  it('reports the physical worksheet row for invalid data while retaining valid rows', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('支出')
    sheet.addRow(['随手记导出'])
    sheet.addRow([])
    sheet.addRow(['交易类型', '日期', '支出账户', '账户币种', '金额'])
    sheet.addRow(['支出', '2026-01-02', '现金', 'CNY', 12])
    sheet.addRow([])
    sheet.addRow(['支出', '2026-02-30', '现金', 'CNY', 20])
    sheet.addRow(['支出', '2026-01-03', '现金', 'CNY', '坏金额'])
    const preview = await parseLedgerBackupBytes(new Uint8Array(await workbook.xlsx.writeBuffer()), '包含%符号.xlsx')
    expect(preview.transactionCount).toBe(1)
    expect(preview.issues?.map(issue => [issue.file, issue.sheet, issue.row])).toEqual([['包含%符号.xlsx', '支出', 6], ['包含%符号.xlsx', '支出', 7]])
  })

  it.each(['json', 'csv', 'xlsx'] as const)('round-trips imported source metadata through %s and the server schema', async format => {
    const data = fixture.imported
    const bytes = format === 'xlsx' ? await createLedgerXlsx(data) : new TextEncoder().encode(format === 'json' ? createLedgerJson(data) : createLedgerCsv(data))
    const result = await parseLedgerBackupBytes(bytes, `backup.${format}`)
    expect(result.backup.data).toEqual(data)
    expect(ledgerBackupSchema.parse(result.backup).data).toEqual(data)
  })

  it('preserves the exact Excel backup timestamp and rejects a newer schema', async () => {
    const ExcelJS = (await import('exceljs')).default
    const when = new Date('2026-01-01T12:34:56.789Z')
    const bytes = await createLedgerXlsx(fixture.imported, when)
    expect((await parseLedgerBackupBytes(bytes, 'backup.xlsx')).exportedAt).toBe(when.toISOString())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(bytes))
    workbook.getWorksheet('说明')!.getCell('B5').value = 999
    await expect(parseLedgerBackupBytes(new Uint8Array(await workbook.xlsx.writeBuffer()), 'newer.xlsx')).rejects.toThrow('数据库版本过新')
  })

  it.each(['csv', 'xlsx'] as const)('preserves literal leading apostrophes and formula-like text in %s', async format => {
    const data = structuredClone(fixture.imported)
    data.accounts[0]!.name = "'备用金"
    data.transactions[0]!.note = "'=原始文字"
    const bytes = format === 'xlsx' ? await createLedgerXlsx(data) : new TextEncoder().encode(createLedgerCsv(data))
    expect((await parseLedgerBackupBytes(bytes, `quotes.${format}`)).backup.data).toEqual(data)
  })

  it('imports or excludes both transfer legs together and remaps a colliding transfer ID', () => {
    const current = empty()
    current.accounts = [{ id: 1, name: '现金', currency: 'CNY', type: 'cash', balance: 10, sortOrder: 0 }, { id: 2, name: '银行卡', currency: 'CNY', type: 'bank', balance: 20, sortOrder: 1 }]
    current.transactions = [{ id: 1, date: '2026-01-01', type: 'expense', accountId: 1, amount: 1, currency: 'CNY', category: '转账', transferId: 'a'.repeat(32) }, { id: 2, date: '2026-01-01', type: 'income', accountId: 2, amount: 1, currency: 'CNY', category: '转账', transferId: 'a'.repeat(32) }]
    const incoming = structuredClone(current)
    incoming.transactions.forEach(record => { record.date = '2026-01-02' })
    const preview = parseLedgerJson(createLedgerJson(incoming))
    const mappings = importAccountMappings(current, [preview])
    const plan = prepareLedgerImport(current, [preview], mappings)
    expect(plan.groups).toHaveLength(1)
    expect(plan.added).toBe(2)
    expect(plan.backup.data.transactions.at(-1)?.transferId).not.toBe('a'.repeat(32))
    expect(prepareLedgerImport(current, [preview], mappings, [plan.groups[0]!.key]).added).toBe(0)
  })
})

describe('HTTP backend import, undo and migration contract', () => {
  it('stores provenance, saves an automatic snapshot, supports undo and rejects a stale preview atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pocketledger-import-test-'))
    const database = openLedgerDatabase(join(directory, 'ledger.sqlite'))
    try {
      restoreLedger(database, backup(fixture.initial))
      const initial = getSnapshot(database)
      const imported = restoreLedger(database, backup(fixture.imported), initial)
      expect(snapshotIdentity(imported)).toBe(snapshotIdentity(fixture.imported))
      const files = readdirSync(join(directory, 'automatic-backups')).sort()
      expect(JSON.parse(readFileSync(join(directory, 'automatic-backups', files.at(-1)!), 'utf8')).data).toEqual(initial)
      restoreLedger(database, backup(initial), imported)
      expect(snapshotIdentity(getSnapshot(database))).toBe(snapshotIdentity(initial))
      updateSettings(database, { ...initial.settings, masked: true })
      const changed = getSnapshot(database)
      expect(() => restoreLedger(database, backup(fixture.imported), initial)).toThrow('账本已变化')
      expect(getSnapshot(database)).toEqual(changed)
      expect(LEDGER_SCHEMA_VERSION).toBe(4)
      expect(BACKUP_FORMAT).toBe('accounting-tool-backup')
    }
    finally { database.close(); rmSync(directory, { recursive: true, force: true }) }
  })
})
