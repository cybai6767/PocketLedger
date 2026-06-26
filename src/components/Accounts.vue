<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useStore } from '../composables/useStorage'
import {
  ACCOUNT_TYPE_LABELS, CURRENCY_LABELS, CURRENCY_SYMBOLS,
  type AccountType, type Currency,
} from '../types'

const { state, toBase, addAccount, updateAccount, removeAccount } = useStore()
const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) => state.settings.masked ? '****' : sym.value + n.toFixed(2)

const editingId = ref<string | null>(null)
import { ref } from 'vue'
const form = reactive({ name: '', type: 'cash' as AccountType, currency: 'CNY' as Currency, balance: 0 })

function startEdit(id: string) {
  const a = state.accounts.find(x => x.id === id)!
  editingId.value = id
  Object.assign(form, { name: a.name, type: a.type, currency: a.currency, balance: a.balance })
}
function submit() {
  if (!form.name.trim()) return
  if (editingId.value) updateAccount(editingId.value, { ...form })
  else addAccount({ ...form })
  cancel()
}
function cancel() {
  editingId.value = null
  Object.assign(form, { name: '', type: 'cash', currency: 'CNY', balance: 0 })
}
</script>

<template>
  <section class="panel">
    <div class="row">
      <h3>账户列表</h3>
    </div>
    <table>
      <thead>
        <tr><th>名称</th><th>类型</th><th>币种</th><th>余额 (本币)</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in state.accounts" :key="a.id">
          <td>{{ a.name }}</td>
          <td>{{ ACCOUNT_TYPE_LABELS[a.type] }}</td>
          <td>{{ a.currency }}</td>
          <td>{{ fmt(toBase(a.balance, a.currency)) }}</td>
          <td>
            <button class="link" @click="startEdit(a.id)">编辑</button>
            <button class="link danger" @click="removeAccount(a.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="panel">
    <h3>{{ editingId ? '编辑账户' : '新增账户' }}</h3>
    <div class="form">
      <label>名称<input v-model="form.name" /></label>
      <label>类型
        <select v-model="form.type">
          <option v-for="(l, k) in ACCOUNT_TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <label>币种
        <select v-model="form.currency">
          <option v-for="(l, k) in CURRENCY_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <label>当前余额<input type="number" v-model.number="form.balance" /></label>
    </div>
    <div class="actions">
      <button class="primary" @click="submit">保存账户</button>
      <button class="ghost" @click="cancel">取消 / 清空</button>
    </div>
  </section>
</template>

<style scoped>
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
h3 { margin: 0 0 14px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
.form { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
input, select { padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); }
.actions { display: flex; gap: 10px; }
.primary { background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
.ghost { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 9px 16px; border-radius: 8px; cursor: pointer; }
.link { background: none; border: none; color: var(--accent); cursor: pointer; }
.link.danger { color: #dc2626; }
</style>
