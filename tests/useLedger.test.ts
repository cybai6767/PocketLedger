import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useLedger } from '../app/composables/useLedger'
import { createLedgerJson, parseLedgerJson } from '../app/utils/ledgerBackup'

afterEach(() => vi.unstubAllGlobals())

function setup() {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { tauri: false } }))
  vi.stubGlobal('useState', (_key: string, initialize: () => unknown) => ref(initialize()))
  const request = vi.fn()
  vi.stubGlobal('$fetch', request)
  return { request, ledger: useLedger() }
}

it('rolls back optimistic settings and clears busy state after a save failure', async () => {
  const { request, ledger } = setup()
  request.mockRejectedValue({ data: { message: '保存失败' } })
  const result = ledger.updateSettings({ theme: 'dark' })
  expect(ledger.state.settings.theme).toBe('dark')
  expect(ledger.busy.value).toBe(true)
  expect(await result).toBe(false)
  expect(ledger.state.settings.theme).toBe('light')
  expect(ledger.lastError.value).toBe('保存失败')
  expect(ledger.busy.value).toBe(false)
})

it('does not add failed transactions and can recover on the next save', async () => {
  const { request, ledger } = setup()
  const account = { id: 1, name: '现金', type: 'cash' as const, currency: 'CNY' as const, balance: 100, sortOrder: 0 }
  ledger.state.accounts.push(account)
  const input = { date: '2026-09-12', accountId: 1, type: 'expense' as const, amount: 20, category: '餐饮' }
  request.mockRejectedValueOnce(new Error('offline'))
  expect(await ledger.addTransaction(input)).toBe(false)
  expect(ledger.state.transactions).toHaveLength(0)
  expect(ledger.state.accounts[0]!.balance).toBe(100)
  request.mockResolvedValueOnce({ transaction: { ...input, id: 1, currency: 'CNY' }, account: { ...account, balance: 80 } })
  expect(await ledger.addTransaction(input)).toBe(true)
  expect(ledger.state.transactions).toHaveLength(1)
  expect(ledger.state.accounts[0]!.balance).toBe(80)
  expect(ledger.lastError.value).toBeNull()
})

it('switches language immediately and persists the complete settings object', async () => {
  const { request, ledger } = setup()
  request.mockResolvedValueOnce({ ...ledger.state.settings, language: 'en' })

  const result = ledger.updateSettings({ language: 'en' })
  expect(ledger.state.settings.language).toBe('en')
  expect(await result).toBe(true)
  expect(request).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
    method: 'PUT',
    body: expect.objectContaining({ language: 'en' }),
  }))
  expect(ledger.state.settings.language).toBe('en')
})

it('keeps an undo snapshot after import and guards it after later changes', async () => {
  const { request, ledger } = setup()
  const before = JSON.parse(createLedgerJson(ledger.state)).data
  const after = { ...before, accounts: [{ id: 1, name: '测试账户', type: 'cash', currency: 'CNY', balance: 100, sortOrder: 0 }] }
  const backup = parseLedgerJson(createLedgerJson(after)).backup
  request.mockResolvedValueOnce(after)
  expect(await ledger.applyImport(backup, before)).toBe(true)
  expect(ledger.canUndoImport.value).toBe(true)
  request.mockResolvedValueOnce(before)
  expect(await ledger.undoImport()).toBe(true)
  expect(ledger.state.accounts).toHaveLength(0)
  expect(ledger.canUndoImport.value).toBe(false)
  expect(request.mock.calls[1]?.[0]).toBe('/api/ledger/import')
  expect(request.mock.calls[1]?.[1]?.body.expected).toEqual(after)
  request.mockResolvedValueOnce(after)
  expect(await ledger.applyImport(backup, before)).toBe(true)
  ledger.state.accounts[0]!.balance = 200
  expect(ledger.canUndoImport.value).toBe(false)
  expect(await ledger.undoImport()).toBe(false)
  expect(request).toHaveBeenCalledTimes(3)
})
