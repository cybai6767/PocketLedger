import type { LedgerSnapshot } from '../types/ledger'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

export function snapshotIdentity(snapshot: LedgerSnapshot): string {
  return JSON.stringify(canonical({
    accounts: [...snapshot.accounts].sort((a, b) => a.id - b.id),
    transactions: [...snapshot.transactions].sort((a, b) => a.id - b.id),
    settings: snapshot.settings,
  }))
}
