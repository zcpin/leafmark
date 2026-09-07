<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/lib/i18n'
import { getYearProgress } from '@/lib/year-progress'

const props = defineProps<{ now: Date }>()
const progress = computed(() => getYearProgress(props.now))
// 向下保留一位小数，避免跨年前提前显示 100%。
const percentage = computed(() => (Math.floor(progress.value.percent * 10) / 10).toFixed(1))
const label = computed(() => t('yearProgress', { year: progress.value.year }))
const remaining = computed(() => t('yearDaysRemaining', { n: progress.value.daysRemaining }))
</script>

<template>
  <div class="year-progress w-full max-w-sm text-xs text-slate-600 dark:text-slate-300">
    <div class="mb-2 flex items-center justify-between gap-4">
      <span class="font-medium">{{ label }}</span>
      <span class="tabular-nums">
        {{ percentage }}%
        <span class="mx-1.5 text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
        <span>{{ remaining }}</span>
      </span>
    </div>
    <div
      class="flex gap-1.5"
      role="progressbar"
      :aria-label="label"
      :aria-valuenow="Number(percentage)"
      :aria-valuetext="`${percentage}% · ${remaining}`"
      :aria-valuemin="0"
      :aria-valuemax="100"
    >
      <div
        v-for="(fill, month) in progress.months"
        :key="month"
        class="h-1 flex-1 overflow-hidden rounded-full bg-slate-400/20 dark:bg-white/15"
        aria-hidden="true"
      >
        <div
          class="h-full rounded-full bg-emerald-600/70 dark:bg-emerald-300/75"
          :style="{ width: `${fill}%` }"
        />
      </div>
    </div>
  </div>
</template>
