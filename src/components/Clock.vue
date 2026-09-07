<script setup lang="ts">
// 顶部轻量时钟 + 日期（纯本地 Intl，F7 扩展）
// 时间/日期由 now 响应式直接派生（computed），任何 Intl 异常都回退手动格式化，
// 保证文本永不为空；刷新由页面共用的时间源驱动
import { computed } from 'vue'

const props = defineProps<{ now: Date }>()

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

const timeText = computed(() => formatTime(props.now))
const dateText = computed(() => formatDate(props.now))
</script>

<template>
  <div class="flex flex-col items-center text-center">
    <time
      :datetime="props.now.toISOString()"
      class="text-[2.75rem] font-medium leading-none tabular-nums tracking-tight text-slate-800 sm:text-5xl dark:text-slate-100"
    >
      {{ timeText }}
    </time>
    <p class="mt-3 text-xs tracking-wide text-slate-600 dark:text-slate-300">{{ dateText }}</p>
  </div>
</template>
