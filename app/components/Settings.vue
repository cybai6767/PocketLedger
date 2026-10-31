<script setup lang="ts">
import { ref } from 'vue'
import type { Currency, Language, LedgerBackupPreview, Settings } from '~~/shared/types/ledger'
import { CURRENCY_LABELS, LEDGER_SCHEMA_VERSION } from '~~/shared/types/ledger'
import {
  exportLedgerCsv,
  exportLedgerJson,
  exportLedgerXlsx,
  parseLedgerJson,
  selectLedgerBackup,
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
const restoreMessage = ref('')
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

function reportRestore(message: string) {
  restoreMessage.value = message
  setError(message)
}

async function chooseBackup() {
  selectingBackup.value = true
  selectedBackup.value = null
  exportMessage.value = ''
  restoreMessage.value = ''
  setError(null)
  try {
    selectedBackup.value = await selectLedgerBackup(isTauri, locale.value, state.settings)
  }
  catch (error) {
    reportRestore(error instanceof Error ? t('backup.readFailed', { error: error.message }) : t('backup.readFailedGeneric'))
  }
  finally {
    selectingBackup.value = false
  }
}

async function chooseLatestAutomaticBackup() {
  selectingBackup.value = true
  selectedBackup.value = null
  exportMessage.value = ''
  restoreMessage.value = ''
  setError(null)
  try {
    const backup = await loadLatestAutomaticBackup()
    if (!backup) {
      reportRestore(t('backup.none'))
      return
    }
    selectedBackup.value = parseLedgerJson(JSON.stringify(backup), locale.value)
  }
  catch (error) {
    reportRestore(error instanceof Error ? t('backup.autoReadFailed', { error: error.message }) : t('backup.autoReadFailedGeneric'))
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
  <div class="settings-page">
    <section class="panel">
      <div class="section-heading">
        <div class="section-title">
          <span class="section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></svg>
          </span>
          <div>
            <h3>{{ t('settings.preferences') }}</h3>
            <p>{{ t('settings.persistDescription') }}</p>
          </div>
        </div>
        <span class="persistence-badge">{{ t('settings.persisted') }}</span>
      </div>

      <div class="preferences-grid">
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
            <button :class="{ on: !state.settings.masked }" :aria-pressed="!state.settings.masked" :disabled="busy" @click="setPreference('masked', false)">{{ t('settings.off') }}</button>
            <button :class="{ on: state.settings.masked }" :aria-pressed="state.settings.masked" :disabled="busy" @click="setPreference('masked', true)">{{ t('settings.on') }}</button>
          </div>
        </div>

        <div class="field">
          <div>
            <label>{{ t('settings.theme') }}</label>
            <p>{{ t('settings.themeDescription') }}</p>
          </div>
          <div class="seg">
            <button :class="{ on: state.settings.theme === 'light' }" :aria-pressed="state.settings.theme === 'light'" :disabled="busy" @click="setPreference('theme', 'light')">{{ t('settings.light') }}</button>
            <button :class="{ on: state.settings.theme === 'dark' }" :aria-pressed="state.settings.theme === 'dark'" :disabled="busy" @click="setPreference('theme', 'dark')">{{ t('settings.dark') }}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel backup">
      <div class="section-heading">
        <div class="section-title">
          <span class="section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-7h8v7" /></svg>
          </span>
          <div>
            <h3>{{ t('backup.title') }}</h3>
            <p>{{ t('backup.description') }}</p>
          </div>
        </div>
        <span class="persistence-badge">{{ t('backup.schema', { version: LEDGER_SCHEMA_VERSION }) }}</span>
      </div>
      <div class="backup-actions">
        <button
          class="backup-export primary-backup"
          :aria-label="exporting === 'json' ? t('backup.generating') : t('backup.exportJson')"
          :disabled="busy || exporting !== null || restoring"
          @click="exportBackup('json')"
        >
          <span class="format-badge" aria-hidden="true">JSON <span>↓</span></span>
          <span class="export-name">{{ exporting === 'json' ? t('backup.generating') : t('backup.exportJson') }}</span>
          <span class="export-description" aria-hidden="true">{{ t('backup.jsonDescription') }}</span>
        </button>
        <button
          class="backup-export"
          :aria-label="exporting === 'xlsx' ? t('backup.generating') : t('backup.exportExcel')"
          :disabled="busy || exporting !== null"
          @click="exportBackup('xlsx')"
        >
          <span class="format-badge" aria-hidden="true">XLSX <span>↓</span></span>
          <span class="export-name">{{ exporting === 'xlsx' ? t('backup.generating') : t('backup.exportExcel') }}</span>
          <span class="export-description" aria-hidden="true">{{ t('backup.excelDescription') }}</span>
        </button>
        <button
          class="backup-export"
          :aria-label="exporting === 'csv' ? t('backup.generating') : t('backup.exportCsv')"
          :disabled="busy || exporting !== null"
          @click="exportBackup('csv')"
        >
          <span class="format-badge" aria-hidden="true">CSV <span>↓</span></span>
          <span class="export-name">{{ exporting === 'csv' ? t('backup.generating') : t('backup.exportCsv') }}</span>
          <span class="export-description" aria-hidden="true">{{ t('backup.csvDescription') }}</span>
        </button>
      </div>
      <p v-if="exportMessage" class="export-success" role="status">{{ exportMessage }}</p>
      <div class="restore-box">
        <div>
          <h4>{{ t('backup.restoreTitle') }}</h4>
          <p>{{ t('backup.restoreDescription') }}</p>
        </div>
        <div class="restore-actions">
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
        <p v-if="restoreMessage" class="restore-feedback" role="alert">{{ restoreMessage }}</p>
      </div>
      <div v-if="selectedBackup" class="restore-preview" role="status">
        <div>
          <strong>{{ t('backup.valid') }}</strong>
          <p v-if="selectedBackup.sourceLabel">{{ t('backup.source', { source: selectedBackup.sourceLabel }) }}</p>
          <p v-else>{{ t('backup.exportedAt', { date: displayDate(selectedBackup.exportedAt) }) }}</p>
          <p>{{ t('backup.contains', { accounts: selectedBackup.accountCount, transactions: selectedBackup.transactionCount }) }}</p>
          <p>{{ t('backup.replaces', { accounts: state.accounts.length, transactions: state.transactions.length }) }}</p>
        </div>
        <button class="restore-confirm" :disabled="busy || restoring" @click="confirmRestore">
          {{ restoring ? t('backup.restoring') : t('backup.restore') }}
        </button>
      </div>
      <div class="backup-notes">
        <p class="backup-tip">{{ t('backup.privacy') }}</p>
        <p>{{ t('backup.automatic') }}</p>
      </div>
    </section>

    <div class="maintenance-grid">
      <section class="panel">
        <div class="section-heading">
          <div class="section-title">
            <span class="section-icon success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" /></svg>
            </span>
            <div>
              <h3>{{ t('integrity.title') }}</h3>
              <p>{{ t('integrity.description') }}</p>
            </div>
          </div>
        </div>
        <div class="integrity-actions maintenance-actions">
          <button :disabled="busy" @click="inspectBalances(false)">{{ t('integrity.check') }}</button>
          <button class="repair" :disabled="busy" @click="inspectBalances(true)">{{ t('integrity.repair') }}</button>
        </div>
        <p v-if="integrityMessage" class="integrity-message" role="status">{{ integrityMessage }}</p>
      </section>

      <section class="panel danger">
        <div class="section-title">
          <span class="section-icon danger-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3L2 21h20zM12 9v5M12 17v.5" /></svg>
          </span>
          <div>
            <h3>{{ t('danger.title') }}</h3>
            <p>{{ t('danger.description') }}</p>
          </div>
        </div>
        <div class="maintenance-actions">
          <button class="danger-btn" :disabled="busy" @click="confirmClear">{{ t('danger.clear') }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page { display: grid; gap: 20px; width: 100%; max-width: 1120px; margin-inline: auto; }
.panel { min-width: 0; padding: 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); box-shadow: var(--panel-shadow); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.section-title { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.section-title > div { min-width: 0; }
.section-icon { display: grid; place-items: center; flex: 0 0 38px; width: 38px; height: 38px; border-radius: 11px; background: var(--accent-soft); color: var(--accent); }
.section-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.section-icon circle { fill: var(--panel); }
.success-icon { color: var(--success); background: var(--success-soft); }
.danger-icon { color: var(--danger); background: var(--danger-soft); }
h3 { margin: 0 0 6px; font-size: 17px; line-height: 1.4; }
p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.persistence-badge { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--input); color: var(--muted); font-size: 11px; white-space: nowrap; }
.preferences-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
.field { display: flex; flex-direction: column; justify-content: space-between; gap: 16px; min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--input); }
label { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 650; }
select { width: 100%; min-width: 0; min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); cursor: pointer; font-size: 13px; }
.seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); }
.seg button { min-width: 0; min-height: 32px; padding: 6px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; }
.seg button.on { background: var(--panel); color: var(--accent); box-shadow: 0 1px 5px var(--accent-shadow); font-weight: 650; }
.backup-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }
.backup-export { display: flex; flex-direction: column; align-items: stretch; gap: 8px; min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); text-align: left; cursor: pointer; transition: border-color .18s, background .18s; }
.backup-export:hover:not(:disabled) { border-color: var(--accent); background: var(--input); }
.primary-backup { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); background: var(--accent-soft); }
.primary-backup:hover:not(:disabled) { background: var(--accent-soft); }
.format-badge { display: flex; align-items: center; justify-content: space-between; color: var(--accent); font-size: 11px; font-weight: 750; letter-spacing: .08em; }
.format-badge > span { font-size: 20px; font-weight: 400; line-height: 1; }
.export-name { font-size: 14px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.export-description { color: var(--muted); font-size: 12px; line-height: 1.6; }
.export-success, .integrity-message { margin-top: 14px; padding: 10px 12px; border-radius: 9px; background: var(--success-soft); color: var(--success); }
.restore-box { margin-top: 18px; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--input); }
.restore-box h4 { margin: 0 0 6px; font-size: 14px; }
.restore-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.restore-feedback { margin: 12px 0 0; color: var(--danger); font-size: 13px; line-height: 1.5; }
.restore-select, .integrity-actions button { min-height: 40px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); font-size: 13px; cursor: pointer; }
.restore-select:hover:not(:disabled), .integrity-actions button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.restore-preview { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 14px; padding: 18px; border: 1px solid var(--success); border-radius: 12px; background: var(--success-soft); }
.restore-preview strong { display: block; margin-bottom: 6px; color: var(--success); font-size: 14px; }
.restore-confirm { flex: 0 0 auto; min-height: 40px; padding: 9px 14px; border: 0; border-radius: 9px; background: var(--danger); color: #fff; cursor: pointer; font-size: 13px; }
.backup-notes { display: grid; gap: 6px; margin-top: 16px; padding-left: 12px; border-left: 2px solid var(--border); }
.backup-tip { color: var(--text); }
.maintenance-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.maintenance-grid .panel { display: flex; flex-direction: column; }
.maintenance-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 20px; }
.integrity-actions button { flex: 1 1 auto; }
.integrity-actions .repair { border-color: var(--accent); background: var(--accent); color: #fff; }
.integrity-actions .repair:hover:not(:disabled) { color: #fff; background: var(--accent-strong); }
.panel.danger { border-color: var(--danger-border); }
.danger-btn { min-height: 40px; padding: 9px 16px; border: 1px solid var(--danger-border); border-radius: 9px; background: var(--danger-soft); color: var(--danger); cursor: pointer; font-size: 13px; font-weight: 600; }
.danger-btn:hover:not(:disabled) { background: var(--danger); color: #fff; }
button:disabled, select:disabled { opacity: .55; cursor: wait; }

@media (max-width: 1100px) and (min-width: 861px) {
  .backup-actions, .maintenance-grid { grid-template-columns: minmax(0, 1fr); }
  .backup-export { gap: 6px; padding: 16px; }
}
@media (max-width: 620px) {
  .settings-page { gap: 16px; }
  .panel { padding: 18px; }
  .section-heading { flex-wrap: wrap; gap: 12px; }
  .section-title { gap: 10px; }
  .section-icon { flex-basis: 34px; width: 34px; height: 34px; border-radius: 10px; }
  .section-heading .persistence-badge { margin-left: 44px; }
  h3 { font-size: 16px; }
  .preferences-grid, .backup-actions, .maintenance-grid { grid-template-columns: minmax(0, 1fr); }
  .preferences-grid, .backup-actions { margin-top: 18px; }
  .field, .backup-export, .restore-box { padding: 16px; }
  .backup-export { gap: 6px; }
  .restore-actions { flex-direction: column; }
  .restore-select, .restore-confirm, .danger-btn { width: 100%; }
  .restore-preview { align-items: stretch; flex-direction: column; padding: 16px; }
  .maintenance-grid { gap: 16px; }
}
</style>
