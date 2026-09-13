<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_LABELS_EN, CURRENCY_LABELS, CURRENCY_SYMBOLS,
  type AccountType, type Currency,
} from '~~/shared/types/ledger'

function moveFocus(index: number) {
  // 获取当前面板下所有带有 nav-input 类的元素
  const inputs = formPanel.value?.querySelectorAll('.nav-input') as NodeListOf<HTMLElement>
  if (inputs && inputs[index]) {
    inputs[index].focus()
  }
}

const {
  state,
  busy,
  toBase,
  addAccount,
  updateAccount,
  removeAccount,
  reorderAccounts,
} = useLedger()
const { locale, t } = useLocale()
const accountTypeLabels = computed(() => locale.value === 'en' ? ACCOUNT_TYPE_LABELS_EN : ACCOUNT_TYPE_LABELS)
const dragIndex = ref<number | null>(null)
// 删除确认弹窗
const showConfirm = ref(false)
const showAlert = ref(false)
const pendingId = ref<number | null>(null) // 待删除账户 id
const skipConfirm = ref(false)        // 本次打开不再提示（刷新后重置）
const dontAskNext = ref(false)        // 弹窗内勾选框的临时绑定
const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) => state.settings.masked ? '****' : sym.value + n.toFixed(2)
const editingId = ref<number | null>(null)
const formPanel = ref<HTMLElement | null>(null)
const form = reactive({ name: '', type: 'cash' as AccountType, currency: 'CNY' as Currency, balance: 0 })

function closeAlert() {
  showAlert.value = false;
}

function handleSave() {
    if (showAlert.value) {
    closeAlert()
    return
  }
  // 校验：名称不能为空
  if (!form.name.trim()) {
    showAlert.value = true;
    return;
  }
  // 校验通过，执行原有的提交逻辑
  submit(); 
}
function onDragStart(index: number) {
  dragIndex.value = index
}

async function onDrop(targetIndex: number) {
  const from = dragIndex.value
  if (from === null || from === targetIndex) return
  const list = state.accounts
  const previousIds = list.map(account => account.id)
  const moved = list.splice(from, 1)[0]!   // 取出被拖的账户
  list.splice(targetIndex, 0, moved)     // 插入到目标位置
  dragIndex.value = null
  const saved = await reorderAccounts(list.map(account => account.id))
  if (!saved) {
    const byId = new Map(list.map(account => [account.id, account]))
    state.accounts = previousIds.map(id => byId.get(id)!)
  }
}

function onDragEnd() {
  dragIndex.value = null
}
// 点击表单面板以外的区域 → 取消编辑
function handleOutsideClick(e: MouseEvent) {
  if (!editingId.value) return                    // 不在编辑态，忽略
  const target = e.target as HTMLElement
  // 点在表单面板内，不取消
  if (formPanel.value && formPanel.value.contains(target)) return
  // 点在“编辑”按钮上（会自行切换），不在这里取消
  if (target.closest('.op-btn.edit')) return
  cancel()
}
onMounted(() => document.addEventListener('click', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))

// 点击“删除”入口：决定是直接删还是弹窗
function askRemove(id: number) {
  if (skipConfirm.value) {
    removeAccount(id)
    return
  }
  pendingId.value = id
  dontAskNext.value = false
  showConfirm.value = true
}

// 确认删除
async function confirmRemove() {
  if (dontAskNext.value) skipConfirm.value = true
  if (pendingId.value && await removeAccount(pendingId.value)) closeConfirm()
}

function closeConfirm() {
  showConfirm.value = false
  pendingId.value = null
}
function startEdit(id: number) {
  const a = state.accounts.find(x => x.id === id)!
  editingId.value = id
  Object.assign(form, { name: a.name, type: a.type, currency: a.currency, balance: a.balance })
}
async function submit() {
  if (!form.name.trim()) return
  const saved = editingId.value
    ? await updateAccount(editingId.value, { ...form })
    : await addAccount({ ...form })
  if (saved) cancel()
}
function cancel() {
  editingId.value = null
  Object.assign(form, { name: '', type: 'cash', currency: 'CNY', balance: 0 })
}
</script>

<template>
  <section class="panel">
    <div class="row">
      <h3>{{ t('account.list') }}</h3>
    </div>
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>{{ t('account.name') }}</th><th>{{ t('account.type') }}</th><th>{{ t('account.currency') }}</th><th>{{ t('account.convertedBalance') }}</th><th>{{ t('common.actions') }}</th></tr>
      </thead>
      <tbody>
        <tr 
          v-for="(a, index) in state.accounts"
          :key="a.id"
          class="drag-row"
          :class="{ dragging:dragIndex === index}"
          draggable="true"
          @dragstart="onDragStart(index)"
          @dragover.prevent
          @drop="onDrop(index)"
          @dragend="onDragEnd">
          <td>
            <span class="drag-handle">⠿</span> {{ a.name }}
          </td>
          <td>{{ accountTypeLabels[a.type] }}</td>
          <td>{{ a.currency }}</td>
          <td>{{ fmt(toBase(a.balance, a.currency)) }}</td>
          <td>
            <div class="op-actions">
              <button class="op-btn edit" @click="startEdit(a.id)">{{ t('common.edit') }}</button>
              <button class="op-btn del" @click="askRemove(a.id)">{{ t('common.delete') }}</button>
            </div>
          </td> 
        </tr>
      </tbody>
    </table>
    </div>
  </section>

  <section class="panel"  ref="formPanel">
    <h3>{{ editingId ? t('account.edit') : t('account.add') }}</h3>
    <div class="form">
      <label>{{ t('account.name') }}
        <input v-model="form.name" class="nav-input" 
        @keydown.right="moveFocus(1)"
        @keydown.enter="handleSave" />
        <div v-if="showAlert" class="alert-mask" @click.self="closeAlert">
            <div class="alert-box">
              <p class="alert-text">{{ t('account.invalid') }}</p>
              <button class="alert-btn" @click="closeAlert">{{ t('common.gotIt') }}</button>
            </div>
        </div>
      </label>
      <label>{{ t('account.type') }}
        <select v-model="form.type" class="nav-input" 
              @keydown.left.prevent="moveFocus(0)"
              @keydown.right.prevent="moveFocus(2)">
            <option v-for="(l, k) in accountTypeLabels" :key="k" :value="k">{{ l }}
          </option>
        </select>
      </label>
      <label>{{ t('account.currency') }}
        <select v-model="form.currency" class="nav-input" 
        @keydown.left.prevent="moveFocus(1)" 
        @keydown.right.prevent="moveFocus(3)">
          <option v-for="(l, k) in CURRENCY_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <label>{{ t('account.balance') }}
        <input type="number" v-model.number="form.balance" class="nav-input"
        @keydown.left="moveFocus(2)" 
        @keydown.enter="submit"/>
      </label>
    </div>
    <div class="actions">
      <button class="primary" :disabled="busy" @click="handleSave">{{ t('account.save') }}</button>
      <button class="ghost" @click="cancel">{{ t('common.cancelClear') }}</button>
    </div>
  </section>
  <div v-if="showConfirm" class="modal-mask" @click.self="closeConfirm">
  <div class="modal">
    <h2 class="modal-title">{{ t('account.confirmDelete') }}</h2>
    <label class="modal-check">
      <input type="checkbox" v-model="dontAskNext" />
      <span>{{ t('account.skipConfirm') }}</span>
    </label>
    <div class="modal-actions">
      <button class="op-btn" @click="closeConfirm">{{ t('common.cancel') }}</button>
      <button class="op-btn del" @click="confirmRemove">{{ t('common.delete') }}</button>
    </div>
  </div>
</div>
</template>

<style scoped>
.table-wrap {
  max-height: 400px;
  max-width: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}
.table-wrap thead th {
  position: sticky;
  top: 0;
  background: var(--panel);
  z-index: 1;
}
.op-actions {
  display: flex;
  gap: 12px;
}
.op-btn {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  cursor: pointer;
  font-size: 14px;
}
.op-btn:hover {
  background: var(--hover);
}
.op-btn.edit { color: var(--accent); }
.op-btn.del { color: #dc2626; }
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 32px;
  min-width: 360px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.modal-title {
  font-size: 22px;
  margin: 0 0 8px;
  color: var(--text);
  text-align: center;        /* 标题居中 */
}
.modal-check {
  display: inline-flex;        /* 改为行内，宽度由内容撑开 */
  flex-direction: row;         /* 勾选框与文字横向并排 */
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: auto;                 /* 不再占满整行 */
  margin: 0 auto 22px;         /* 整组在弹窗里水平居中 */
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}

.modal-check input { width: 14px; height: 14px; cursor: pointer; }
.modal-actions {
  display: flex;
  justify-content: center;   /* 按钮居中 */
  gap: 12px;
}
.drag-row:hover { background: var(--hover); }
.drag-row.dragging { opacity: 0.5; background: var(--accent); }
.drag-handle {
  color: var(--muted);
  cursor: grab;
  margin-right: 8px;
  user-select: none;
}
/* 弹窗遮罩：点击空白处关闭的核心在于 @click.self */
.alert-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

/* 弹窗主体 */
.alert-box {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 30px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center; /* 内部元素水平居中 */
  justify-content: center; /* 内部元素垂直居中 */
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  text-align: center;
}

/* 提示文字 */
.alert-text {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 20px 0;
  color: var(--text);
}

/* “知道了”按钮 */
.alert-btn {
  padding: 8px 24px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.alert-btn:hover {
  opacity: 0.9;
}

.drag-row { cursor: grab; transition: background 0.15s; }
.panel { width: 100%; min-width: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
h3 { margin: 0 0 14px; }
table { width: 100%; min-width: 620px; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
.form { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
label { min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
input, select { width: 100%; min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.primary { background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
.ghost { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 9px 16px; border-radius: 8px; cursor: pointer; }

@media (max-width: 860px) {
  .form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .panel { padding: 16px; }
  .form { grid-template-columns: minmax(0, 1fr); }
  .modal { width: calc(100% - 32px); min-width: 0; padding: 24px 20px; }
  .alert-box { width: calc(100% - 32px); min-width: 0; }
}
</style>
