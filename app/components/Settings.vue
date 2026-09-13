<script setup lang="ts">
import { ref } from 'vue'
import type { Currency, Language, LedgerBackupPreview, Settings } from '~~/shared/types/ledger'
import { CURRENCY_LABELS, LEDGER_SCHEMA_VERSION } from '~~/shared/types/ledger'
import {
  exportLedgerCsv,
  exportLedgerJson,
  exportLedgerXlsx,
  parseLedgerJson,
  selectLedgerJson,
} from '../utils/ledgerBackup'

const {
  state,
  busy,
  setError,
  updateSettings,
  clearAll,
  restoreBackup,
  checkBalanceIntegrity,
  loadLatestAutomaticBackup,
} = useLedger()
const { locale, t } = useLocale()
const isTauri = Boolean(useRuntimeConfig().public.tauri)
const exporting = ref<'csv' | 'xlsx' | 'json' | null>(null)
const exportMessage = ref('')
const selectedBackup = ref<LedgerBackupPreview | null>(null)
const selectingBackup = ref(false)
const restoring = ref(false)
const integrityMessage = ref('')

function setPreference<K extends keyof Settings>(key: K, value: Settings[K]) {
  void updateSettings({ [key]: value })
}

function changeCurrency(event: Event) {
  setPreference('baseCurrency', (event.target as HTMLSelectElement).value as Currency)
}

function changeLanguage(event: Event) {
  setPreference('language', (event.target as HTMLSelectElement).value as Language)
}

async function confirmClear() {
  if (confirm(t('danger.confirm'))) {
    await clearAll()
  }
}

async function exportBackup(format: 'csv' | 'xlsx' | 'json') {
  exporting.value = format
  exportMessage.value = ''
  setError(null)
  try {
    const saved = format === 'xlsx'
      ? await exportLedgerXlsx(state, isTauri)
      : format === 'json'
        ? await exportLedgerJson(state, isTauri)
        : await exportLedgerCsv(state, isTauri)
    if (saved) exportMessage.value = t('backup.saved', { format: format.toUpperCase() })
  }
  catch (error) {
    setError(error instanceof Error ? t('backup.exportFailed', { error: error.message }) : t('backup.exportFailedGeneric'))
  }
  finally {
    exporting.value = null
  }
}

async function chooseBackup() {
  selectingBackup.value = true
  selectedBackup.value = null
  exportMessage.value = ''
  setError(null)
  try {
    selectedBackup.value = await selectLedgerJson(isTauri, locale.value)
  }
  catch (error) {
    setError(error instanceof Error ? t('backup.readFailed', { error: error.message }) : t('backup.readFailedGeneric'))
  }
  finally {
    selectingBackup.value = false
  }
}

async function chooseLatestAutomaticBackup() {
  selectingBackup.value = true
  selectedBackup.value = null
  exportMessage.value = ''
  setError(null)
  try {
    const backup = await loadLatestAutomaticBackup()
    if (!backup) {
      setError(t('backup.none'))
      return
    }
    selectedBackup.value = parseLedgerJson(JSON.stringify(backup), locale.value)
  }
  catch (error) {
    setError(error instanceof Error ? t('backup.autoReadFailed', { error: error.message }) : t('backup.autoReadFailedGeneric'))
  }
  finally {
    selectingBackup.value = false
  }
}

function displayDate(value: string) {
  return new Date(value).toLocaleString(locale.value, { hour12: false })
}

async function confirmRestore() {
  const selected = selectedBackup.value
  if (!selected) return
  const agreed = confirm(t('backup.confirm', {
    accounts: selected.accountCount,
    transactions: selected.transactionCount,
  }))
  if (!agreed) return

  restoring.value = true
  exportMessage.value = ''
  setError(null)
  try {
    const safetySaved = await exportLedgerJson(state, isTauri)
    if (!safetySaved) {
      setError(t('backup.safetyCancelled'))
      return
    }
    const restored = await restoreBackup(selected.backup)
    if (restored) {
      exportMessage.value = t('backup.restoreSuccess', {
        accounts: selected.accountCount,
        transactions: selected.transactionCount,
      })
      selectedBackup.value = null
    }
  }
  catch (error) {
    setError(error instanceof Error ? t('backup.restoreFailed', { error: error.message }) : t('backup.restoreFailedGeneric'))
  }
  finally {
    restoring.value = false
  }
}

async function inspectBalances(repair = false) {
  integrityMessage.value = ''
  const result = await checkBalanceIntegrity(repair)
  if (!result) return
  if (result.ok) {
    integrityMessage.value = t('integrity.ok')
  }
  else if (result.repaired) {
    integrityMessage.value = t('integrity.repaired', { count: result.issues.length })
  }
  else {
    integrityMessage.value = t('integrity.issues', { count: result.issues.length })
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div>
        <h3>{{ t('settings.preferences') }}</h3>
        <p>{{ t('settings.persistDescription') }}</p>
      </div>
      <span class="persistence-badge">{{ t('settings.persisted') }}</span>
    </div>

    <div class="field">
      <div>
        <label for="interface-language">{{ t('settings.language') }}</label>
        <p>{{ t('settings.languageDescription') }}</p>
      </div>
      <select id="interface-language" :value="state.settings.language" :disabled="busy" @change="changeLanguage">
        <option value="zh-CN">{{ t('settings.chinese') }}</option>
        <option value="en">{{ t('settings.english') }}</option>
      </select>
    </div>

    <div class="field">
      <div>
        <label for="base-currency">{{ t('settings.baseCurrency') }}</label>
        <p>{{ t('settings.baseDescription') }}</p>
      </div>
      <select id="base-currency" :value="state.settings.baseCurrency" :disabled="busy" @change="changeCurrency">
        <option v-for="(label, key) in CURRENCY_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <div class="field">
      <div>
        <label>{{ t('settings.mask') }}</label>
        <p>{{ t('settings.maskDescription') }}</p>
      </div>
      <div class="seg">
        <button :class="{ on: !state.settings.masked }" :disabled="busy" @click="setPreference('masked', false)">{{ t('settings.off') }}</button>
        <button :class="{ on: state.settings.masked }" :disabled="busy" @click="setPreference('masked', true)">{{ t('settings.on') }}</button>
      </div>
    </div>

    <div class="field">
      <div>
        <label>{{ t('settings.theme') }}</label>
        <p>{{ t('settings.themeDescription') }}</p>
      </div>
      <div class="seg">
        <button :class="{ on: state.settings.theme === 'light' }" :disabled="busy" @click="setPreference('theme', 'light')">{{ t('settings.light') }}</button>
        <button :class="{ on: state.settings.theme === 'dark' }" :disabled="busy" @click="setPreference('theme', 'dark')">{{ t('settings.dark') }}</button>
      </div>
    </div>
  </section>

  <section class="panel backup">
    <div class="section-heading">
      <div>
        <h3>{{ t('backup.title') }}</h3>
        <p>{{ t('backup.description') }}</p>
      </div>
      <span class="persistence-badge">{{ t('backup.schema', { version: LEDGER_SCHEMA_VERSION }) }}</span>
    </div>
    <div class="backup-actions">
      <button
        class="backup-export primary-backup"
        :disabled="busy || exporting !== null || restoring"
        @click="exportBackup('json')"
      >
        {{ exporting === 'json' ? t('backup.generating') : t('backup.exportJson') }}
      </button>
      <button
        class="backup-export"
        :disabled="busy || exporting !== null"
        @click="exportBackup('xlsx')"
      >
        {{ exporting === 'xlsx' ? t('backup.generating') : t('backup.exportExcel') }}
      </button>
      <button
        class="backup-export"
        :disabled="busy || exporting !== null"
        @click="exportBackup('csv')"
      >
        {{ exporting === 'csv' ? t('backup.generating') : t('backup.exportCsv') }}
      </button>
      <span v-if="exportMessage" class="export-success" role="status">{{ exportMessage }}</span>
    </div>
    <div class="restore-box">
      <div>
        <h4>{{ t('backup.restoreTitle') }}</h4>
        <p>{{ t('backup.restoreDescription') }}</p>
      </div>
      <button
        class="restore-select"
        :disabled="busy || selectingBackup || restoring || exporting !== null"
        @click="chooseBackup"
      >
        {{ selectingBackup ? t('backup.reading') : t('backup.select') }}
      </button>
      <button
        class="restore-select"
        :disabled="busy || selectingBackup || restoring || exporting !== null"
        @click="chooseLatestAutomaticBackup"
      >{{ t('backup.latest') }}</button>
    </div>
    <div v-if="selectedBackup" class="restore-preview" role="status">
      <div>
        <strong>{{ t('backup.valid') }}</strong>
        <p>{{ t('backup.exportedAt', { date: displayDate(selectedBackup.exportedAt) }) }}</p>
        <p>{{ t('backup.contains', { accounts: selectedBackup.accountCount, transactions: selectedBackup.transactionCount }) }}</p>
        <p>{{ t('backup.replaces', { accounts: state.accounts.length, transactions: state.transactions.length }) }}</p>
      </div>
      <button class="restore-confirm" :disabled="busy || restoring" @click="confirmRestore">
        {{ restoring ? t('backup.restoring') : t('backup.restore') }}
      </button>
    </div>
    <p class="backup-tip">{{ t('backup.privacy') }}</p>
    <p class="automatic-tip">{{ t('backup.automatic') }}</p>
  </section>

  <section class="panel">
    <div class="section-heading">
      <div>
        <h3>{{ t('integrity.title') }}</h3>
        <p>{{ t('integrity.description') }}</p>
      </div>
      <div class="integrity-actions">
        <button :disabled="busy" @click="inspectBalances(false)">{{ t('integrity.check') }}</button>
        <button class="repair" :disabled="busy" @click="inspectBalances(true)">{{ t('integrity.repair') }}</button>
      </div>
    </div>
    <p v-if="integrityMessage" class="integrity-message" role="status">{{ integrityMessage }}</p>
  </section>

  <section class="panel danger">
    <div>
      <h3>{{ t('danger.title') }}</h3>
      <p>{{ t('danger.description') }}</p>
    </div>
    <button class="danger-btn" :disabled="busy" @click="confirmClear">{{ t('danger.clear') }}</button>
  </section>
</template>

<style scoped>
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: var(--panel-shadow); }
.section-heading, .panel.danger { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.panel.danger { border-color: var(--danger-border); }
h3 { margin: 0 0 5px; }
p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.persistence-badge { flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; background: var(--success-soft); color: var(--success); font-size: 11px; }
.backup-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.backup-actions button { padding: 10px 16px; border-radius: 9px; cursor: pointer; }
.backup-export { border: 1px solid var(--accent); background: var(--accent); color: #fff; }
.primary-backup { box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 24%, transparent); }
.export-success { color: var(--success); font-size: 12px; }
.backup-tip { margin-top: 12px; color: var(--danger); }
.automatic-tip { margin-top: 6px; }
.restore-box, .restore-preview { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 18px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--input); }
.restore-box h4 { margin: 0 0 4px; }
.restore-select { flex: 0 0 auto; padding: 9px 14px; border: 1px solid var(--accent); border-radius: 9px; background: transparent; color: var(--accent); cursor: pointer; }
.restore-preview { border-color: var(--success); background: var(--success-soft); }
.restore-preview strong { color: var(--success); }
.restore-confirm { flex: 0 0 auto; padding: 9px 14px; border: 0; border-radius: 9px; background: var(--danger); color: #fff; cursor: pointer; }
.integrity-actions { display: flex; gap: 8px; }
.integrity-actions button { padding: 9px 14px; border: 1px solid var(--accent); border-radius: 9px; background: transparent; color: var(--accent); cursor: pointer; }
.integrity-actions .repair { background: var(--accent); color: #fff; }
.integrity-message { margin-top: 14px; color: var(--success); }
.field { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--border); }
.field:last-child { border-bottom: 0; padding-bottom: 2px; }
label { display: block; margin-bottom: 3px; font-size: 14px; font-weight: 650; }
select { min-width: 145px; padding: 9px; border: 1px solid var(--border); border-radius: 9px; background: var(--input); color: var(--text); }
.seg { display: flex; }
.seg button { padding: 7px 14px; border: 1px solid var(--border); background: var(--input); color: var(--text); cursor: pointer; }
.seg button:first-child { border-radius: 9px 0 0 9px; }
.seg button:last-child { margin-left: -1px; border-radius: 0 9px 9px 0; }
.seg button.on { position: relative; background: var(--accent); color: #fff; border-color: var(--accent); }
.danger-btn { flex: 0 0 auto; background: var(--danger); color: #fff; border: none; padding: 10px 16px; border-radius: 9px; cursor: pointer; }
button:disabled, select:disabled { opacity: .55; cursor: wait; }

@media (max-width: 620px) {
  .section-heading, .panel.danger, .field, .restore-box, .restore-preview { align-items: flex-start; flex-direction: column; gap: 12px; }
  .field, .field > div, select { width: 100%; min-width: 0; }
  .seg { width: 100%; }
  .seg button { flex: 1; }
  .danger-btn { width: 100%; }
  .backup-actions { align-items: stretch; flex-direction: column; }
  .backup-actions button { width: 100%; }
  .restore-select, .restore-confirm { width: 100%; }
  .integrity-actions { width: 100%; }
  .integrity-actions button { flex: 1; }
}
</style>
