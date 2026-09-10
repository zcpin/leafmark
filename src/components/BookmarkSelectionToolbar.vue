<script setup lang="ts">
import { t } from '@/lib/i18n'
import { useSelectionStore } from '@/stores/selection'
import Icon from './Icon.vue'

const selection = useSelectionStore()
</script>

<template>
  <div v-if="selection.active" id="bookmark-selection-toolbar" class="mb-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-400/20 pb-3 text-sm text-slate-700 dark:text-slate-200">
    <div class="min-w-0 flex-1 basis-full sm:basis-auto">
      <p class="font-medium tabular-nums" role="status">{{ t('selectionCount', { n: selection.selected.length }) }}</p>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t('selectionHint') }}</p>
    </div>
    <div class="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
      <button type="button" :disabled="selection.busy" class="rounded-lg px-3 py-2 text-xs hover:bg-slate-500/10 disabled:opacity-40" @click="selection.allSelected ? selection.clear() : selection.selectAll()">
        {{ selection.allSelected ? t('selectionClear') : t('selectionAll') }}
      </button>
      <button type="button" :disabled="selection.selected.length === 0 || selection.busy" class="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-40 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300" @click="selection.openMove()">
        <Icon name="folderMove" />{{ t('moveToFolder') }}
      </button>
      <button type="button" :disabled="selection.busy" class="rounded-lg px-3 py-2 text-xs hover:bg-slate-500/10 disabled:opacity-40" @click="selection.end()">{{ t('selectionDone') }}</button>
    </div>
  </div>
</template>
