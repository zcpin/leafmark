<script setup lang="ts">
// 顶部大字时钟 + 日期（纯本地 Intl，F7 扩展）
// 时间/日期由 now 响应式直接派生（computed），任何 Intl 异常都回退手动格式化，
// 保证文本永不为空；对齐整分钟调度刷新
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const now = ref(new Date())

function safeLocale(): string {
  try {
    const raw =
      typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
        ? String(chrome.i18n.getUILanguage() ?? '')
        : String(navigator.language ?? '')
    return raw || 'en-US'
  } catch {
    return 'en-US'
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(d: Date): string {
  const loc = safeLocale()
  const hour12 = !loc.toLowerCase().startsWith('zh')
  try {
    const s = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12 })
    if (s) return s
  } catch {
    /* 回退到手动格式化 */
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(d: Date): string {
  const loc = safeLocale()
  try {
    const s = d.toLocaleDateString(loc, { month: 'long', day: 'numeric', weekday: 'long' })
    if (s) return s
  } catch {
    /* 回退到手动格式化 */
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const timeText = computed(() => formatTime(now.value))
const dateText = computed(() => formatDate(now.value))

let timer = 0

/** 对齐到下一整分钟再刷新，避免秒级空轮询 */
function schedule() {
  const d = new Date()
  const ms = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds())
  timer = window.setTimeout(() => {
    now.value = new Date()
    schedule()
  }, ms)
}

onMounted(schedule)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="glass flex flex-col items-center rounded-3xl px-12 py-6 text-center">
    <div
      class="text-7xl font-bold leading-none tabular-nums tracking-tight text-slate-800 dark:text-slate-100"
    >
      {{ timeText }}
    </div>
    <div class="mt-3 text-base text-slate-600 dark:text-slate-300">{{ dateText }}</div>
  </div>
</template>