<script setup lang="ts">
// 顶部大字时钟 + 日期（纯本地 Intl，F7 扩展）
// 精确对齐整分钟刷新；玻璃卡片承载保证壁纸/渐变上均可读
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { uiLocale } from '@/lib/i18n'

const now = ref(new Date())
const timeText = ref('')
const dateText = ref('')
let timer = 0

function locale(): string {
  return uiLocale()
}

function refresh() {
  const d = now.value
  const loc = locale()
  // 中文环境 24 小时制，其余 12 小时制
  const hour12 = !loc.toLowerCase().startsWith('zh')
  timeText.value = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12 })
  dateText.value = d.toLocaleDateString(loc, { month: 'long', day: 'numeric', weekday: 'long' })
}

function tick() {
  now.value = new Date()
}

/** 对齐到下一整分钟再刷新，避免秒级空轮询 */
function schedule() {
  const d = new Date()
  const ms = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds())
  timer = window.setTimeout(() => {
    tick()
    refresh()
    schedule()
  }, ms)
}

onMounted(() => {
  tick()
  refresh()
  schedule()
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="glass flex flex-col items-center rounded-3xl px-12 py-6 text-center">
    <div class="text-7xl font-bold leading-none tabular-nums tracking-tight text-slate-800 dark:text-slate-100">
      {{ timeText }}
    </div>
    <div class="mt-3 text-base text-slate-600 dark:text-slate-300">{{ dateText }}</div>
  </div>
</template>