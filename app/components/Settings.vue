<script setup lang="ts">
import { ref } from 'vue'
import type { Currency, LedgerBackupPreview, Settings } from '~~/shared/types/ledger'
import { CURRENCY_LABELS } from '~~/shared/types/ledger'
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

async function confirmClear() {
  if (confirm('确定要清空当前账本的全部账户和流水吗？此操作不可恢复。')) {
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
    if (saved) exportMessage.value = `${format.toUpperCase()} 备份已保存`
  }
  catch (error) {
    setError(error instanceof Error ? `导出失败：${error.message}` : '导出失败，请稍后再试')
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
    selectedBackup.value = await selectLedgerJson(isTauri)
  }
  catch (error) {
    setError(error instanceof Error ? `读取备份失败：${error.message}` : '读取备份失败')
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
      setError('还没有自动备份；完成一次数据修改后会自动生成')
      return
    }
    selectedBackup.value = parseLedgerJson(JSON.stringify(backup))
  }
  catch (error) {
    setError(error instanceof Error ? `读取自动备份失败：${error.message}` : '读取自动备份失败')
  }
  finally {
    selectingBackup.value = false
  }
}

function displayDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function confirmRestore() {
  const selected = selectedBackup.value
  if (!selected) return
  const agreed = confirm(
    `即将用备份中的 ${selected.accountCount} 个账户、${selected.transactionCount} 条流水覆盖当前账本。\n\n恢复前会要求保存当前账本的 JSON 备份。是否继续？`,
  )
  if (!agreed) return

  restoring.value = true
  exportMessage.value = ''
  setError(null)
  try {
    const safetySaved = await exportLedgerJson(state, isTauri)
    if (!safetySaved) {
      setError('已取消保存恢复前备份，当前数据没有被修改')
      return
    }
    const restored = await restoreBackup(selected.backup)
    if (restored) {
      exportMessage.value = `恢复成功：${selected.accountCount} 个账户，${selected.transactionCount} 条流水`
      selectedBackup.value = null
    }
  }
  catch (error) {
    setError(error instanceof Error ? `恢复失败：${error.message}` : '恢复失败，当前数据未修改')
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
    integrityMessage.value = '检查完成：所有账户余额都正确。'
  }
  else if (result.repaired) {
    integrityMessage.value = `发现并修复了 ${result.issues.length} 个账户的余额。`
  }
  else {
    integrityMessage.value = `发现 ${result.issues.length} 个账户余额不一致，可以点击“检查并修复”。`
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div>
        <h3>偏好设置</h3>
        <p>这些设置会保存到当前账本，在刷新或重新打开应用后仍然生效。</p>
      </div>
      <span class="persistence-badge">已持久化</span>
    </div>

    <div class="field">
      <div>
        <label for="base-currency">基准货币</label>
        <p>摘要与报表统一折算到该币种。</p>
      </div>
      <select id="base-currency" :value="state.settings.baseCurrency" :disabled="busy" @change="changeCurrency">
        <option v-for="(label, key) in CURRENCY_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <div class="field">
      <div>
        <label>金额遮罩</label>
        <p>在公共场所隐藏所有金额。</p>
      </div>
      <div class="seg">
        <button :class="{ on: !state.settings.masked }" :disabled="busy" @click="setPreference('masked', false)">关闭</button>
        <button :class="{ on: state.settings.masked }" :disabled="busy" @click="setPreference('masked', true)">开启</button>
      </div>
    </div>

    <div class="field">
      <div>
        <label>界面主题</label>
        <p>选择适合当前环境的显示模式。</p>
      </div>
      <div class="seg">
        <button :class="{ on: state.settings.theme === 'light' }" :disabled="busy" @click="setPreference('theme', 'light')">浅色</button>
        <button :class="{ on: state.settings.theme === 'dark' }" :disabled="busy" @click="setPreference('theme', 'dark')">深色</button>
      </div>
    </div>
  </section>

  <section class="panel backup">
    <div class="section-heading">
      <div>
        <h3>数据备份与恢复</h3>
        <p>JSON 用于完整恢复；Excel 和 CSV 用于查看、整理与交换数据。</p>
      </div>
      <span class="persistence-badge">数据库 v1</span>
    </div>
    <div class="backup-actions">
      <button
        class="backup-export primary-backup"
        :disabled="busy || exporting !== null || restoring"
        @click="exportBackup('json')"
      >
        {{ exporting === 'json' ? '正在生成…' : '导出完整 JSON 备份' }}
      </button>
      <button
        class="backup-export"
        :disabled="busy || exporting !== null"
        @click="exportBackup('xlsx')"
      >
        {{ exporting === 'xlsx' ? '正在生成…' : '导出 Excel 备份' }}
      </button>
      <button
        class="backup-export"
        :disabled="busy || exporting !== null"
        @click="exportBackup('csv')"
      >
        {{ exporting === 'csv' ? '正在生成…' : '导出 CSV 备份' }}
      </button>
      <span v-if="exportMessage" class="export-success" role="status">{{ exportMessage }}</span>
    </div>
    <div class="restore-box">
      <div>
        <h4>从完整备份恢复</h4>
        <p>先选择 JSON 文件检查内容。确认恢复前，应用还会要求保存一份当前账本。</p>
      </div>
      <button
        class="restore-select"
        :disabled="busy || selectingBackup || restoring || exporting !== null"
        @click="chooseBackup"
      >
        {{ selectingBackup ? '正在读取…' : '选择 JSON 备份' }}
      </button>
      <button
        class="restore-select"
        :disabled="busy || selectingBackup || restoring || exporting !== null"
        @click="chooseLatestAutomaticBackup"
      >读取最近自动备份</button>
    </div>
    <div v-if="selectedBackup" class="restore-preview" role="status">
      <div>
        <strong>备份检查通过</strong>
        <p>导出时间：{{ displayDate(selectedBackup.exportedAt) }}</p>
        <p>包含 {{ selectedBackup.accountCount }} 个账户、{{ selectedBackup.transactionCount }} 条流水</p>
        <p>当前的 {{ state.accounts.length }} 个账户、{{ state.transactions.length }} 条流水将被替换。</p>
      </div>
      <button class="restore-confirm" :disabled="busy || restoring" @click="confirmRestore">
        {{ restoring ? '正在恢复…' : '覆盖并恢复' }}
      </button>
    </div>
    <p class="backup-tip">备份文件包含未遮罩的真实金额，请保存到可信位置，不要公开上传。</p>
    <p class="automatic-tip">每次修改数据前，应用会在本机自动保存一份完整快照，并只保留最近 7 份。</p>
  </section>

  <section class="panel">
    <div class="section-heading">
      <div>
        <h3>账本余额检查</h3>
        <p>按照“期初余额 + 收入 − 支出”重新核对，不一致时可以自动修复。</p>
      </div>
      <div class="integrity-actions">
        <button :disabled="busy" @click="inspectBalances(false)">只检查</button>
        <button class="repair" :disabled="busy" @click="inspectBalances(true)">检查并修复</button>
      </div>
    </div>
    <p v-if="integrityMessage" class="integrity-message" role="status">{{ integrityMessage }}</p>
  </section>

  <section class="panel danger">
    <div>
      <h3>危险区域</h3>
      <p>清空后账户、交易和偏好设置都会重置；可使用完整 JSON 备份恢复。</p>
    </div>
    <button class="danger-btn" :disabled="busy" @click="confirmClear">清空全部数据</button>
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
