<script setup lang="ts">
import type { Currency, Settings } from '~~/shared/types/ledger'
import { CURRENCY_LABELS } from '~~/shared/types/ledger'

const { state, busy, updateSettings, clearAll } = useLedger()

function setPreference<K extends keyof Settings>(key: K, value: Settings[K]) {
  void updateSettings({ [key]: value })
}

function changeCurrency(event: Event) {
  setPreference('baseCurrency', (event.target as HTMLSelectElement).value as Currency)
}

async function confirmClear() {
  if (confirm('确定要清空服务端的全部账户和流水吗？此操作不可恢复。')) {
    await clearAll()
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div>
        <h3>偏好设置</h3>
        <p>这些设置会保存到服务端，在刷新页面后仍然生效。</p>
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

  <section class="panel danger">
    <div>
      <h3>危险区域</h3>
      <p>清空后账户、交易和偏好设置都会重置，SQLite 数据无法在界面内恢复。</p>
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
  .section-heading, .panel.danger, .field { align-items: flex-start; flex-direction: column; gap: 12px; }
  .field, .field > div, select { width: 100%; min-width: 0; }
  .seg { width: 100%; }
  .seg button { flex: 1; }
  .danger-btn { width: 100%; }
}
</style>
