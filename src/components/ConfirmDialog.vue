<script setup lang="ts">
// 删除等危险操作确认（B4），消费 ui store
import { useUiStore } from '@/stores/ui'
import { t } from '@/lib/i18n'
import { useDialogFocus } from '@/composables/useDialogFocus'

import Icon from './Icon.vue'

const ui = useUiStore()
const { setPanel, titleId } = useDialogFocus(() => ui.confirmVisible, () => ui.resolveConfirm(false))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.confirmVisible"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="ui.resolveConfirm(false)"
    >
      <div :ref="setPanel" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" class="glass-strong w-full max-w-sm rounded-2xl p-6 outline-none">
        <div class="flex items-start gap-3">
          <div
            class="flex size-10 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"
          >
            <Icon name="trash" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 :id="titleId" class="text-base font-semibold text-slate-800 dark:text-slate-100">
              {{ ui.confirmOptions.title }}
            </h2>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {{ ui.confirmOptions.message }}
            </p>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10"
            @click="ui.resolveConfirm(false)"
          >
            {{ t('cancel') }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-500"
            @click="ui.resolveConfirm(true)"
          >
            {{ ui.confirmOptions.confirmText ?? t('confirmDelete') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
