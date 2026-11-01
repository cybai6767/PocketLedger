<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Decimal from 'decimal.js'
import type { LedgerBackupPreview, LedgerSnapshot } from '~~/shared/types/ledger'
import { LEDGER_SCHEMA_VERSION } from '~~/shared/types/ledger'
import { snapshotIdentity } from '~~/shared/utils/ledgerSnapshot'
import { exportLedgerCsv, exportLedgerJson, exportLedgerXlsx, parseLedgerJson, selectLedgerBackups } from '../utils/ledgerBackup'
import { importAccountMappings, prepareLedgerImport, type ImportAccountMapping } from '../utils/ledgerImport'

const { state, busy, setError, hydrate, loadSnapshot, loadLatestAutomaticBackup, applyImport, restoreBackup,
  undoImport, canUndoImport, setTab } = useLedger()
const { locale, t } = useLocale()
const native = Boolean(useRuntimeConfig().public.tauri)
const tr = (zh: string, en: string) => locale.value === 'en' ? en : zh
const page = ref<'import' | 'export' | 'restore'>('import')
const loading = ref(false)
const message = ref('')
const error = ref('')
const previews = ref<LedgerBackupPreview[]>([])
const baseline = ref<LedgerSnapshot | null>(null)
const mappings = ref<ImportAccountMapping[]>([])
const excluded = ref<string[]>([])
const duplicatesReviewed = ref(false)
const issuesReviewed = ref(false)
const rowLimit = ref(20)
const suspectLimit = ref(20)
const issueLimit = ref(20)
const restored = ref<LedgerBackupPreview | null>(null)
const restoreAcknowledged = ref(false)
const working = computed(() => busy.value || loading.value)
const planResult = computed(() => {
  if (!baseline.value || !previews.value.length) return { plan: null, error: '' }
  try { return { plan: prepareLedgerImport(baseline.value, previews.value, mappings.value, excluded.value), error: '' } }
  catch (e) { return { plan: null, error: e instanceof Error ? e.message : String(e) } }
})
const plan = computed(() => planResult.value.plan)
const previewRows = computed(() => {
  if (!plan.value || !baseline.value) return []
  const ids = new Set(baseline.value.transactions.map(record => record.id))
  return plan.value.backup.data.transactions.filter(record => !ids.has(record.id))
})
const totals = computed(() => {
  const result = new Map<string, { currency: string, income: Decimal, expense: Decimal }>()
  for (const record of previewRows.value) {
    if (record.transferId) continue
    const total = result.get(record.currency) ?? { currency: record.currency, income: new Decimal(0), expense: new Decimal(0) }
    total[record.type] = total[record.type].plus(record.amount)
    result.set(record.currency, total)
  }
  return [...result.values()]
})
const ready = computed(() => plan.value && plan.value.added > 0
  && (!plan.value.suspected.length || duplicatesReviewed.value)
  && (!plan.value.issues.length || issuesReviewed.value))

function money(value: Decimal | number) {
  return state.settings.masked ? '****' : Number(value).toLocaleString(locale.value, { maximumFractionDigits: 8 })
}
function clearFeedback() { message.value = ''; error.value = ''; setError(null) }
function failed(e: unknown) { error.value = e instanceof Error ? e.message : String(e) }
watch(mappings, () => { duplicatesReviewed.value = false }, { deep: true })

async function chooseImport() {
  clearFeedback()
  loading.value = true
  previews.value = []
  baseline.value = null
  try {
    const files = await selectLedgerBackups(native, locale.value, state.settings)
    if (!files) return
    const current = await loadSnapshot()
    if (snapshotIdentity(current) !== snapshotIdentity(state)) hydrate(current)
    baseline.value = JSON.parse(JSON.stringify(current)) as LedgerSnapshot
    mappings.value = importAccountMappings(current, files)
    excluded.value = []
    duplicatesReviewed.value = false
    issuesReviewed.value = false
    rowLimit.value = suspectLimit.value = issueLimit.value = 20
    previews.value = files
  }
  catch (e) { failed(e) }
  finally { loading.value = false }
}

async function confirmImport() {
  if (!ready.value || !plan.value || !baseline.value || working.value) return
  const prepared = plan.value
  clearFeedback()
  if (await applyImport(prepared.backup, baseline.value)) {
    message.value = tr(`导入完成：新增 ${prepared.added} 条流水、${prepared.newAccounts} 个账户；已导入过 ${prepared.alreadyImported} 条，手动跳过 ${prepared.skipped} 条，异常 ${prepared.issues.length} 条。`,
      `Imported ${prepared.added} entries and ${prepared.newAccounts} accounts. Previously imported: ${prepared.alreadyImported}; skipped: ${prepared.skipped}; invalid: ${prepared.issues.length}.`)
    previews.value = []
    baseline.value = null
  }
}

async function undoLastImport() {
  clearFeedback()
  if (await undoImport()) {
    previews.value = []
    baseline.value = null
    message.value = tr('已撤销本次导入，恢复到导入前的账本。', 'Import undone. The ledger is back to its previous state.')
  }
}

async function exportData(format: 'json' | 'csv' | 'xlsx') {
  loading.value = true
  clearFeedback()
  try {
    const saved = format === 'json' ? await exportLedgerJson(state, native)
      : format === 'csv' ? await exportLedgerCsv(state, native) : await exportLedgerXlsx(state, native)
    if (saved) message.value = t('backup.saved', { format: format.toUpperCase() })
  }
  catch (e) { failed(e) }
  finally { loading.value = false }
}

async function chooseRestore(automatic = false) {
  loading.value = true
  clearFeedback()
  restored.value = null
  restoreAcknowledged.value = false
  try {
    if (automatic) {
      const value = await loadLatestAutomaticBackup()
      if (!value) throw new Error(t('backup.none'))
      restored.value = parseLedgerJson(JSON.stringify(value), locale.value)
    }
    else {
      const values = await selectLedgerBackups(native, locale.value, state.settings)
      if (!values) return
      if (values.length !== 1 || values[0]!.sourceLabel) {
        throw new Error(tr('恢复仅接受一份本应用的完整备份。第三方表格或多个文件请使用“导入账单”。',
          'Choose one complete PocketLedger backup. Use Import for third-party spreadsheets or multiple files.'))
      }
      restored.value = values[0]!
    }
  }
  catch (e) { failed(e) }
  finally { loading.value = false }
}

async function confirmRestore() {
  if (!restored.value || !restoreAcknowledged.value || working.value) return
  const selected = restored.value
  clearFeedback()
  if (await restoreBackup(selected.backup)) {
    message.value = t('backup.restoreSuccess', { accounts: selected.accountCount, transactions: selected.transactionCount })
    restored.value = null
    previews.value = []
    baseline.value = null
    restoreAcknowledged.value = false
  }
}

function dateRange(preview: LedgerBackupPreview) {
  const dates = preview.backup.data.transactions.map(record => record.date).sort()
  return dates.length ? `${dates[0]} — ${dates.at(-1)}` : tr('没有有效流水', 'No valid entries')
}

</script>

<template>
  <section class="data-panel">
    <header class="data-heading">
      <div><h3>{{ tr('数据管理', 'Data management') }}</h3><p>{{ tr('导入日常账单，导出完整数据，或从备份恢复账本。', 'Import bills, export your data, or restore a complete backup.') }}</p></div>
      <span class="schema">{{ t('backup.schema', { version: LEDGER_SCHEMA_VERSION }) }}</span>
    </header>
    <nav class="data-tabs" :aria-label="tr('数据管理功能', 'Data management tools')">
      <button :class="{ active: page === 'import' }" :aria-pressed="page === 'import'" @click="page = 'import'">{{ tr('导入账单', 'Import') }}</button>
      <button :class="{ active: page === 'export' }" :aria-pressed="page === 'export'" @click="page = 'export'">{{ tr('导出数据', 'Export') }}</button>
      <button :class="{ active: page === 'restore' }" :aria-pressed="page === 'restore'" @click="page = 'restore'">{{ tr('备份与恢复', 'Backup & restore') }}</button>
    </nav>

    <div v-if="page === 'import'" class="tool-content">
      <div class="intro"><div><h4>{{ tr('把账单添加到当前账本', 'Add bills to this ledger') }}</h4><p>{{ tr('支持随手记 Excel、本应用 JSON / Excel / CSV，可一次选择多个文件。已有流水和设置会保留。', 'Choose one or more Suishouji Excel or PocketLedger JSON / Excel / CSV files. Existing entries and preferences are kept.') }}</p></div>
        <button class="primary" :disabled="working" @click="chooseImport">{{ loading ? t('backup.reading') : tr('选择账单文件', 'Choose files') }}</button></div>
      <p class="snapshot-note">{{ tr('导入前自动留存快照，无需下载 JSON。完成后、继续记账前可撤销本次导入。', 'A snapshot is saved automatically, with no JSON download. You can undo the import before making further changes.') }}</p>
      <div v-if="previews.length" class="preview">
        <ol class="steps"><li>{{ tr('选择文件', 'Choose files') }}</li><li class="current">{{ tr('核对预览', 'Review') }}</li><li>{{ tr('确认导入', 'Import') }}</li></ol>
        <ul class="file-list"><li v-for="(file, index) in previews" :key="index"><strong>{{ file.fileName }}</strong><span>{{ dateRange(file) }} · {{ file.transactionCount }} {{ tr('条流水', 'entries') }}</span></li></ul>
        <h4>{{ tr('账户对应与余额', 'Accounts and balances') }}</h4>
        <p>{{ tr('历史账单不代表当前余额。默认保持已有账户余额；新账户请填写当前真实余额（默认 0），不按历史收支推算。', 'Historical bills do not determine current balances. Existing balances are kept. Enter the actual current balance for a new account (default 0).') }}</p>
        <div class="account-mappings">
          <div v-for="mapping in mappings" :key="mapping.key" class="account-mapping">
            <strong>{{ JSON.parse(mapping.key)[0] }} <small>{{ mapping.currency }}</small></strong>
            <label><span>{{ tr('导入到账户', 'Destination account') }}</span><select v-model="mapping.targetId" :disabled="working"><option :value="null">{{ tr('新建账户', 'Create account') }}</option><option v-for="account in state.accounts.filter(a => a.currency === mapping.currency)" :key="account.id" :value="account.id">{{ account.name }}</option></select></label>
            <template v-if="mapping.targetId === null"><label><span>{{ tr('新账户名称', 'New account name') }}</span><input v-model="mapping.name" maxlength="80" :disabled="working"></label><label><span>{{ tr('当前真实余额', 'Actual current balance') }}</span><input v-model.number="mapping.balance" type="number" step="any" :disabled="working"></label></template>
            <label v-else class="check"><input v-model="mapping.affectBalance" type="checkbox" :disabled="working"><span>{{ tr('新增收支同时变动余额（历史补录通常不勾选）', 'Also change balance by imported income/expense (leave off for historical bills)') }}</span></label>
          </div>
        </div>
        <p v-if="planResult.error" class="error" role="alert">{{ planResult.error }}</p>
        <template v-if="plan">
          <div class="import-stats"><div><strong>{{ plan.added }}</strong><span>{{ tr('将新增流水', 'New entries') }}</span></div><div><strong>{{ plan.alreadyImported }}</strong><span>{{ tr('已导入，自动跳过', 'Already imported') }}</span></div><div><strong>{{ plan.suspected.length }}</strong><span>{{ tr('组疑似重复', 'Possible duplicates') }}</span></div><div><strong>{{ plan.issues.length }}</strong><span>{{ tr('条异常待处理', 'Invalid rows') }}</span></div></div>
          <div v-for="total in totals" :key="total.currency" class="currency-totals"><strong>{{ total.currency }}</strong><span>{{ tr('收入', 'Income') }} {{ money(total.income) }}</span><span>{{ tr('支出', 'Expense') }} {{ money(total.expense) }}</span></div>
          <details v-if="plan.suspected.length" open class="review-box"><summary>{{ tr('检查疑似重复记录', 'Review possible duplicates') }}</summary><p>{{ tr('同一天同金额可能是不同消费，不会直接删除。勾选保留，取消勾选则跳过；转账成对处理。', 'Same-day amounts may be separate purchases. Checked groups are kept; unchecked groups are skipped. Transfers stay paired.') }}</p>
            <div class="result-actions"><button class="secondary" :disabled="working" @click="excluded = []">{{ tr('保留全部疑似', 'Keep all possible duplicates') }}</button><button class="secondary" :disabled="working" @click="excluded = plan.suspected.map(group => group.key)">{{ tr('跳过全部疑似', 'Skip all possible duplicates') }}</button></div>
            <label v-for="group in plan.suspected.slice(0, suspectLimit)" :key="group.key" class="duplicate-row"><input :checked="!excluded.includes(group.key)" type="checkbox" :disabled="working" @change="excluded = ($event.target as HTMLInputElement).checked ? excluded.filter(key => key !== group.key) : [...excluded, group.key]"><span><strong>{{ group.records[0]?.date }} · {{ group.records[0]?.category }} · {{ money(group.records[0]?.amount ?? 0) }} {{ group.records[0]?.currency }}</strong><small>{{ group.file }} · {{ group.sheet }} · {{ tr('行', 'row') }} {{ group.row }} <span v-if="group.records.length > 1"> · {{ tr('整组转账', 'Transfer pair') }}</span></small></span></label>
            <button v-if="plan.suspected.length > suspectLimit" class="secondary" @click="suspectLimit += 20">{{ tr('查看更多疑似重复', 'Show more possible duplicates') }}</button>
            <label class="check review-confirm"><input v-model="duplicatesReviewed" type="checkbox" :disabled="working"><span>{{ tr('已核对疑似重复，按上面的保留选项导入', 'I reviewed these groups and their keep/skip choices') }}</span></label>
          </details>
          <details v-if="plan.issues.length" open class="review-box"><summary>{{ tr('异常记录不会导入', 'Invalid rows will not be imported') }}</summary><ul class="issue-list"><li v-for="(issue, index) in plan.issues.slice(0, issueLimit)" :key="index">{{ issue.file }} · {{ issue.sheet }} · {{ tr('行', 'row') }} {{ issue.row }}：{{ issue.message }}</li></ul><button v-if="plan.issues.length > issueLimit" class="secondary" @click="issueLimit += 20">{{ tr('查看更多异常', 'Show more errors') }}</button><label class="check review-confirm"><input v-model="issuesReviewed" type="checkbox" :disabled="working"><span>{{ tr('已查看异常，仅导入有效记录；原文件保持不变', 'I reviewed the errors. Import only valid rows; keep the original files unchanged') }}</span></label></details>
          <details v-if="previewRows.length" class="review-box"><summary>{{ tr('查看将新增的流水', 'Preview new entries') }}（{{ previewRows.length }}）</summary><div class="table-scroll"><table><thead><tr><th>{{ tr('日期', 'Date') }}</th><th>{{ tr('账户', 'Account') }}</th><th>{{ tr('分类', 'Category') }}</th><th>{{ tr('金额', 'Amount') }}</th><th>{{ tr('备注', 'Note') }}</th></tr></thead><tbody><tr v-for="record in previewRows.slice(0, rowLimit)" :key="record.id"><td>{{ record.source?.fields['日期'] || record.date }}</td><td>{{ plan.backup.data.accounts.find(a => a.id === record.accountId)?.name }}</td><td>{{ record.category }}</td><td>{{ record.type === 'income' ? '+' : '−' }}{{ money(record.amount) }} {{ record.currency }}</td><td>{{ record.note }}</td></tr></tbody></table></div><button v-if="previewRows.length > rowLimit" class="secondary" @click="rowLimit += 50">{{ tr('查看更多流水', 'Show more entries') }}</button></details>
          <div class="import-footer"><p>{{ plan.newAccounts }} {{ tr('个新账户。已有账户、流水和设置保留。', 'new accounts. Existing accounts, entries and preferences are retained.') }}</p><button class="primary" :disabled="working || !ready" @click="confirmImport">{{ busy ? tr('正在导入…', 'Importing…') : tr(`确认导入 ${plan.added} 条`, `Import ${plan.added} entries`) }}</button></div>
          <p v-if="!plan.added && plan.alreadyImported" class="snapshot-note">{{ tr('这些记录已经导入过，无需重复导入。', 'These entries have already been imported.') }}</p>
        </template>
      </div>
      <div v-if="canUndoImport" class="result-actions"><button class="secondary" :disabled="working" @click="setTab('reports')">{{ tr('查看流水', 'View entries') }}</button><button class="secondary" :disabled="working" @click="undoLastImport">{{ tr('撤销本次导入', 'Undo import') }}</button></div>
    </div>

    <div v-else-if="page === 'export'" class="tool-content">
      <h4>{{ tr('导出完整数据', 'Export your complete data') }}</h4><p>{{ tr('JSON 用于完整迁移。Excel 和 CSV 包含账户、流水、设置、转账关联和导入来源详情；Excel 首先显示流水。', 'JSON is for full migration. Excel and CSV include accounts, entries, settings, transfer links and original import details. Excel opens with entries first.') }}</p>
      <div class="export-grid"><button v-for="format in (['xlsx', 'csv', 'json'] as const)" :key="format" class="export-card" :disabled="working" @click="exportData(format)"><strong>{{ format.toUpperCase() }}</strong><span>{{ format === 'xlsx' ? t('backup.exportExcel') : format === 'csv' ? t('backup.exportCsv') : t('backup.exportJson') }}</span><small>{{ format === 'json' ? tr('完整备份与迁移', 'Complete backup') : tr('完整字段，可再次读取', 'Full fields, importable') }}</small></button></div>
    </div>

    <div v-else class="tool-content">
      <h4>{{ tr('整本恢复，与追加导入分开', 'Restore a whole ledger') }}</h4><p>{{ tr('仅用于恢复本应用的完整备份，会替换当前账户、流水和设置。恢复前自动保留快照，无需另存 JSON。', 'Restore one complete PocketLedger backup, replacing accounts, entries and preferences. A safety snapshot is saved automatically, with no download required.') }}</p>
      <div class="result-actions"><button class="secondary" :disabled="working" @click="chooseRestore(false)">{{ tr('选择完整备份', 'Choose complete backup') }}</button><button class="secondary" :disabled="working" @click="chooseRestore(true)">{{ t('backup.latest') }}</button></div>
      <div v-if="restored" class="restore-review"><strong>{{ t('backup.contains', { accounts: restored.accountCount, transactions: restored.transactionCount }) }}</strong><p>{{ t('backup.replaces', { accounts: state.accounts.length, transactions: state.transactions.length }) }}</p><label class="check"><input v-model="restoreAcknowledged" type="checkbox" :disabled="working"><span>{{ tr('我确认用这份备份替换当前账本', 'I confirm replacing this ledger with the backup') }}</span></label><button class="danger-button" :disabled="working || !restoreAcknowledged" @click="confirmRestore">{{ t('backup.restore') }}</button></div>
    </div>
    <p v-if="message" class="success" role="status">{{ message }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <p class="privacy">{{ tr('文件在当前设备读取。Web 的账本和自动快照保存在运行服务的电脑；卸载或重装前请手动导出完整备份。', 'Files are read on this device. Web ledgers and snapshots are stored on the server computer. Export a complete backup before uninstalling or reinstalling.') }}</p>
  </section>
</template>

<style scoped>
.data-panel { min-width: 0; padding: 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); box-shadow: var(--panel-shadow); }
.data-heading,.intro,.import-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
h3,h4 { margin: 0 0 7px; font-size: 17px; } h4 { font-size: 14px; } p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.schema { flex: 0 0 auto; padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 11px; }
.data-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 4px; padding: 4px; margin: 20px 0; background: var(--input); border: 1px solid var(--border); border-radius: 11px; }
.data-tabs button { min-height: 40px; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }.data-tabs button.active { background: var(--panel); color: var(--accent); font-weight: 650; box-shadow: 0 1px 4px var(--accent-shadow); }
.primary,.secondary,.danger-button { min-height: 40px; padding: 9px 16px; border: 1px solid var(--border); border-radius: 9px; font-size: 13px; cursor: pointer; }.primary { background: var(--accent); color: #fff; border-color: var(--accent); flex: 0 0 auto; }.secondary { background: var(--panel); color: var(--text); }.danger-button { background: var(--danger); color: #fff; border-color: var(--danger); }
.snapshot-note { margin-top: 14px; padding: 10px 12px; background: var(--input); border-radius: 8px; }.preview { margin-top: 20px; }.steps { display: flex; justify-content: space-between; gap: 8px; list-style-position: inside; padding: 0 0 14px; color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--border); }.steps .current { color: var(--accent); font-weight: 650; }
.file-list { list-style: none; margin: 0 0 24px; padding: 0; }.file-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 12px; overflow-wrap: anywhere; }.file-list span { color: var(--muted); }
.account-mappings { display: grid; gap: 12px; margin: 14px 0 20px; }.account-mapping { display: grid; grid-template-columns: minmax(100px,1fr) repeat(3,minmax(0,1fr)); align-items: end; gap: 12px; padding: 14px; background: var(--input); border: 1px solid var(--border); border-radius: 10px; }.account-mapping strong { align-self: center; font-size: 13px; overflow-wrap: anywhere; }.account-mapping strong small { display: block; color: var(--muted); margin-top: 5px; font-size: 11px; }
label { display: grid; gap: 5px; min-width: 0; font-size: 12px; color: var(--muted); }input:not([type=checkbox]),select { width: 100%; min-width: 0; min-height: 40px; padding: 8px 10px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--text); }.check { display: flex; align-items: flex-start; gap: 8px; line-height: 1.7; }.check input,.duplicate-row input { flex: 0 0 auto; margin: 4px 0 0; accent-color: var(--accent); width: 16px; height: 16px; }.account-mapping .check { grid-column: span 2; align-self: center; }
.import-stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin-top: 16px; }.import-stats div { display: grid; gap: 5px; padding: 14px; border-radius: 10px; background: var(--accent-soft); }.import-stats strong { color: var(--accent); font-size: 22px; }.import-stats span { color: var(--muted); font-size: 11px; }
.currency-totals { display: flex; flex-wrap: wrap; gap: 16px; padding: 14px 0; color: var(--muted); font-size: 12px; }.review-box { margin: 14px 0; padding: 14px; border: 1px solid var(--border); border-radius: 10px; }summary { cursor: pointer; font-size: 13px; font-weight: 650; }details[open] summary { margin-bottom: 12px; }.duplicate-row { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 12px; }.duplicate-row strong { color: var(--text); font-weight: 500; }.duplicate-row small { display: block; margin-top: 4px; overflow-wrap: anywhere; }.review-confirm { margin-top: 14px; }.issue-list { padding-left: 18px; font-size: 12px; color: var(--danger); line-height: 1.8; overflow-wrap: anywhere; }
.table-scroll { max-height: 400px; overflow: auto; margin-bottom: 12px; }table { width: 100%; border-collapse: collapse; font-size: 12px; }th,td { padding: 10px; text-align: left; border-bottom: 1px solid var(--border); min-width: 90px; }th { background: var(--input); position: sticky; top: 0; }td { overflow-wrap: anywhere; }.import-footer { align-items: center; padding-top: 16px; }.result-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.export-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin-top: 20px; }.export-card { display: grid; gap: 10px; padding: 20px; text-align: left; border: 1px solid var(--border); border-radius: 12px; background: var(--input); color: var(--text); cursor: pointer; }.export-card strong { color: var(--accent); }.export-card small { color: var(--muted); line-height: 1.7; }.restore-review { display: grid; gap: 14px; padding: 18px; margin-top: 18px; background: var(--danger-soft); border: 1px solid var(--danger-border); border-radius: 10px; font-size: 13px; }
.success,.error { margin-top: 14px; padding: 12px; border-radius: 9px; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }.success { color: var(--success); background: var(--success-soft); }.error { color: var(--danger); background: var(--danger-soft); }.privacy { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--border); }button:disabled,input:disabled,select:disabled { opacity: .5; cursor: not-allowed; }
@media(max-width:900px) { .account-mapping { grid-template-columns: repeat(2,minmax(0,1fr)); }.account-mapping .check { grid-column: 1/-1; } }
@media(max-width:620px) { .data-panel { padding: 18px; }.data-heading { flex-wrap: wrap; gap: 8px; }.intro,.import-footer { flex-direction: column; align-items: stretch; }.intro .primary,.import-footer .primary { width: 100%; }.import-stats { grid-template-columns: repeat(2,minmax(0,1fr)); }.account-mapping { grid-template-columns: minmax(0,1fr); }.account-mapping .check { grid-column: auto; }.data-tabs button { font-size: 12px; padding-inline: 4px; }.export-grid { grid-template-columns: minmax(0,1fr); }.steps { font-size: 11px; }.result-actions button { flex: 1 1 auto; } }
</style>
