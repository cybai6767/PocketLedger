<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useStore } from '../composables/useStorage'
import { CURRENCY_SYMBOLS, type TxType, type Currency } from '../types'

const { state, addTransaction, removeTransaction } = useStore()

// 表单状态
const form = reactive({
  date: new Date().toISOString().split('T')[0],
  type: 'expense' as TxType,
  accountId: state.accounts[0]?.id || '',
  amount: 0,
  currency: 'CNY' as Currency,
  category: '餐饮',
  note: ''
})

const txPanel = ref<HTMLElement | null>(null)
const filterAcc = ref('all')
const searchQuery = ref('')

// 焦点跳转
function moveFocus(index: number) {
  const inputs = txPanel.value?.querySelectorAll('.nav-input') as NodeListOf<HTMLElement>
  inputs[index]?.focus()
}

function save() {
  const acc = state.accounts.find(a => a.id === form.accountId)
  if (!acc || form.amount <= 0) return
  
  // 确保交易币种与账户币种一致
  addTransaction({ 
    ...form, 
    date: form.date!,        // 加一个 ! 告诉 TS 这里肯定有值
    currency: acc.currency 
  })
  
  form.amount = 0 
  moveFocus(3)
}

// 过滤后的流水列表
const filteredList = computed(() => {
  return state.transactions.filter(t => {
    const matchAcc = filterAcc.value === 'all' || t.accountId === filterAcc.value
    const matchKey = t.category.includes(searchQuery.value) || (t.note || '').includes(searchQuery.value)
    return matchAcc && matchKey
  })
})

const getAccName = (id: string) => state.accounts.find(a => a.id === id)?.name || '未知账户'
const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
</script>

<template>
  <div ref="txPanel">
    <!-- 记一笔表单 -->
    <section class="panel">
      <h3>记一笔</h3>
      <div class="form-grid">
        <label>日期
          <input type="date" v-model="form.date" class="nav-input" @keydown.right="moveFocus(1)" />
        </label>
        <label>类型
          <select v-model="form.type" class="nav-input" @keydown.left.prevent="moveFocus(0)" @keydown.right.prevent="moveFocus(2)">
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </label>
        <label>来源账户
          <select v-model="form.accountId" class="nav-input" @keydown.left.prevent="moveFocus(1)" @keydown.right.prevent="moveFocus(3)">
            <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>金额
          <input type="number" v-model.number="form.amount" class="nav-input" placeholder="0.00"
                 @keydown.left="moveFocus(2)" @keydown.right="moveFocus(4)" @keydown.enter="save" />
        </label>
        <label>分类
          <input v-model="form.category" class="nav-input" placeholder="餐饮/交通等"
                 @keydown.left="moveFocus(3)" @keydown.enter="save" />
        </label>
      </div>
      <button class="primary save-btn" @click="save">保存</button>
    </section>

    <!-- 流水列表 -->
    <section class="panel">
      <div class="list-header">
        <h3>流水</h3>
        <div class="filters">
          <select v-model="filterAcc">
            <option value="all">全部账户</option>
            <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="searchQuery" placeholder="搜索关键词..." class="search-box" />
        </div>
      </div>

      <div class="table-wrap">
        <table v-if="filteredList.length">
          <thead>
            <tr><th>日期</th><th>分类</th><th>账户</th><th>金额</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in filteredList" :key="t.id">
              <td>{{ t.date }}</td>
              <td>{{ t.category }}</td>
              <td>{{ getAccName(t.accountId) }}</td>
              <td :class="t.type">
                {{ t.type === 'income' ? '+' : '-' }}{{ CURRENCY_SYMBOLS[t.currency || 'CNY'] }}{{ fmt(t.amount) }}
              </td>
              <td><button class="link-danger" @click="removeTransaction(t.id)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">暂无更多交易记录</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
input, select { padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 14px; }
.save-btn { padding: 10px 24px; }

.list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.filters { display: flex; gap: 10px; }
.search-box { width: 180px; }

.table-wrap { max-height: 400px; overflow-y: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border); }
.income { color: #16a34a; font-weight: 600; }
.expense { color: #dc2626; font-weight: 600; }
.empty { text-align: center; padding: 40px; color: var(--muted); }
.link-danger { background: none; border: 1px solid #dc2626; color: #dc2626; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
.primary { background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; }
</style>
