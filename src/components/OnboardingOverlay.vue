<script setup lang="ts">
// 新手引导（G1）：3 步覆盖核心交互，storage.local 记录完成态，仅首次显示
import { onMounted, ref } from 'vue'

import { t } from '@/lib/i18n'
import { storageGet, storageSet } from '@/lib/chrome-storage'

const COMPLETED_KEY = 'onboardingCompleted'

const visible = ref(false)
const step = ref(0)

const steps = [
  { title: t('onboardingStep1Title'), desc: t('onboardingStep1Desc') },
  { title: t('onboardingStep2Title'), desc: t('onboardingStep2Desc') },
  { title: t('onboardingStep3Title'), desc: t('onboardingStep3Desc') },
]

onMounted(async () => {
  const done = await storageGet<boolean>(COMPLETED_KEY, false, 'local')
  if (!done) visible.value = true
})

async function finish() {
  visible.value = false
  await storageSet(COMPLETED_KEY, true, 'local')
}

function next() {
  if (step.value >= steps.length - 1) {
    void finish()
  } else {
    step.value++
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div class="glass-strong w-full max-w-sm rounded-2xl p-6 text-center">
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">
          🍃
        </div>
        <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">
          {{ steps[step]?.title }}
        </h2>
        <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {{ steps[step]?.desc }}
        </p>

        <!-- 进度点 -->
        <div class="mt-5 flex justify-center gap-1.5">
          <span
            v-for="(_, i) in steps"
            :key="i"
            class="size-1.5 rounded-full transition-colors"
            :class="i === step ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'"
          />
        </div>

        <div class="mt-6 flex justify-between">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-500/10 dark:text-slate-400"
            @click="finish"
          >
            {{ t('onboardingSkip') }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            @click="next"
          >
            {{ step >= steps.length - 1 ? t('onboardingDone') : t('onboardingNext') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
