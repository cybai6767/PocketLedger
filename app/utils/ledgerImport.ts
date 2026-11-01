import Decimal from 'decimal.js'
import type { Account, LedgerBackupPreview, LedgerSnapshot, Transaction, TransactionSource } from '../../shared/types/ledger'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, LEDGER_SCHEMA_VERSION } from '../../shared/types/ledger'
import { parseLedgerJson } from './ledgerBackup'

export interface ImportAccountMapping {
  key: string
  name: string
  currency: Account['currency']
  type: Account['type']
  targetId: number | null
  balance: number
  affectBalance: boolean
}

export interface ImportGroup {
  key: string
  file: string
  sheet: string
  row: number
  records: Transaction[]
  suspected: boolean
}

const accountKey = (account: Pick<Account, 'name' | 'currency'>) => JSON.stringify([account.name, account.currency])

export function importAccountMappings(current: LedgerSnapshot, previews: LedgerBackupPreview[]): ImportAccountMapping[] {
  const mappings = new Map<string, ImportAccountMapping>()
  for (const preview of previews) {
    for (const account of preview.backup.data.accounts) {
      const key = accountKey(account)
      if (mappings.has(key)) continue
      const matches = current.accounts.filter(item => item.name === account.name && item.currency === account.currency)
      mappings.set(key, { key, name: account.name, currency: account.currency, type: account.type,
        targetId: matches.length === 1 ? matches[0]!.id : null, balance: 0, affectBalance: false })
    }
  }
  return [...mappings.values()]
}

function originalSource(preview: LedgerBackupPreview, record: Transaction): TransactionSource | undefined {
  if (record.source) return record.source
  if (!preview.fileId) return undefined
  return { format: 'pocketledger', fileId: preview.fileId, fileName: preview.fileName ?? '',
    sheet: 'Transactions', row: record.id, fields: {} }
}

function sourceKey(record: Transaction): string | null {
  if (!record.source) return null
  const { format, fileId, sheet, row, fields } = record.source
  return JSON.stringify([format, fileId, sheet, row, Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))])
}

function semanticKey(record: Transaction): string {
  return JSON.stringify([record.accountId, record.date, record.type, record.amount, record.currency, record.category, record.note ?? ''])
}

function originalTime(record: Transaction): string {
  return record.source?.fields['日期'] ?? record.source?.fields['Date'] ?? ''
}

// Different known times are separate transactions; an older date-only entry needs review.
function mayDuplicate(left: Transaction, right: Transaction): boolean {
  const a = originalTime(left)
  const b = originalTime(right)
  return !(a.length > 10 && b.length > 10 && a !== b)
}

export function prepareLedgerImport(
  current: LedgerSnapshot,
  previews: LedgerBackupPreview[],
  mappings: ImportAccountMapping[],
  excluded: readonly string[] = [],
) {
  const accounts = current.accounts.map(account => ({ ...account }))
  const transactions = current.transactions.map(record => ({ ...record }))
  const targets = new Map<string, Account>()
  const policies = new Map<string, boolean>()
  let nextAccountId = accounts.reduce((max, account) => Math.max(max, account.id), 0) + 1
  let nextOrder = accounts.reduce((max, account) => Math.max(max, account.sortOrder), -1) + 1
  for (const mapping of mappings) {
    let target: Account | undefined
    if (mapping.targetId !== null) {
      target = accounts.find(account => account.id === mapping.targetId && account.currency === mapping.currency)
      if (!target) throw new Error('请选择同币种的有效账户 / Select an existing account in the same currency')
    }
    else {
      if (!mapping.name.trim()) throw new Error('新账户名称不能为空 / Enter an account name')
      target = { id: nextAccountId++, name: mapping.name.trim(), type: mapping.type, currency: mapping.currency,
        balance: mapping.balance, sortOrder: nextOrder++ }
      accounts.push(target)
    }
    targets.set(mapping.key, target)
    policies.set(mapping.key, mapping.targetId !== null && mapping.affectBalance)
  }

  const knownSources = new Set(current.transactions.map(sourceKey).filter((key): key is string => key !== null))
  const knownSemantics = new Map<string, Transaction[]>()
  for (const record of current.transactions) {
    const key = semanticKey(record)
    const records = knownSemantics.get(key) ?? []
    records.push(record)
    knownSemantics.set(key, records)
  }
  const usedTransfers = new Set(current.transactions.map(record => record.transferId).filter(Boolean))
  const groups: ImportGroup[] = []
  const selected = new Set(excluded)
  const activeNewAccounts = new Set<number>()
  const nets = new Map<number, Decimal>()
  let nextId = transactions.reduce((max, record) => Math.max(max, record.id), 0) + 1
  let transferSequence = 0
  let alreadyImported = 0
  let added = 0
  let skipped = 0

  for (const [fileIndex, preview] of previews.entries()) {
    const sourceAccounts = new Map(preview.backup.data.accounts.map(account => [account.id, account]))
    const fileGroups = new Map<string, Transaction[]>()
    for (const record of preview.backup.data.transactions) {
      const key = record.transferId ? `transfer:${record.transferId}` : `row:${record.id}`
      const members = fileGroups.get(key) ?? []
      members.push(record)
      fileGroups.set(key, members)
    }
    for (const [localKey, members] of fileGroups) {
      const key = `${fileIndex}:${localKey}`
      const rows = members.map(record => {
        const account = sourceAccounts.get(record.accountId)!
        const target = targets.get(accountKey(account))!
        const source = originalSource(preview, record)
        return { ...record, accountId: target.id, ...(source ? { source } : {}) }
      })
      const identities = rows.map(sourceKey)
      if (identities.every(identity => identity !== null && knownSources.has(identity))) {
        alreadyImported += rows.length
        continue
      }
      // Transfers are reviewed and included/excluded as a complete pair.
      const suspected = rows.some(record => (knownSemantics.get(semanticKey(record)) ?? []).some(other => mayDuplicate(record, other)))
      const first = rows[0]!
      groups.push({ key, file: first.source?.fileName ?? preview.fileName ?? '', sheet: first.source?.sheet ?? '',
        row: first.source?.row ?? first.id, records: rows, suspected })
      if (selected.has(key)) { skipped += rows.length; continue }
      let transferId: string | undefined
      if (members[0]?.transferId) {
        transferId = members[0].transferId
        while (usedTransfers.has(transferId)) transferId = (++transferSequence).toString(16).padStart(32, '0')
        usedTransfers.add(transferId)
      }
      rows.forEach((record, index) => {
        const next: Transaction = { ...record, id: nextId++ }
        if (transferId) next.transferId = transferId
        else delete next.transferId
        transactions.push(next)
        added += 1
        const origin = sourceAccounts.get(members[index]!.accountId)!
        const target = targets.get(accountKey(origin))!
        activeNewAccounts.add(target.id)
        if (policies.get(accountKey(origin))) {
          const net = nets.get(target.id) ?? new Decimal(0)
          nets.set(target.id, record.type === 'income' ? net.plus(record.amount) : net.minus(record.amount))
        }
        const identity = sourceKey(next)
        if (identity) knownSources.add(identity)
        const semantic = semanticKey(next)
        const matches = knownSemantics.get(semantic) ?? []
        matches.push(next)
        knownSemantics.set(semantic, matches)
      })
    }
  }
  for (const account of accounts) account.balance = new Decimal(account.balance).plus(nets.get(account.id) ?? 0).toDecimalPlaces(8).toNumber()
  const originalIds = new Set(current.accounts.map(account => account.id))
  const accountList = accounts.filter(account => originalIds.has(account.id) || activeNewAccounts.has(account.id))
  const backup = parseLedgerJson(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LEDGER_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    data: { accounts: accountList, transactions, settings: { ...current.settings } } })).backup
  return { backup, groups, added, skipped, alreadyImported,
    newAccounts: accountList.filter(account => !originalIds.has(account.id)).length,
    suspected: groups.filter(group => group.suspected),
    issues: previews.flatMap(preview => preview.issues ?? []),
  }
}
