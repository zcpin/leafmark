<script setup lang="ts">
import { useDialogFocus } from '@/composables/useDialogFocus'
import { t } from '@/lib/i18n'
import { openUrl } from '@/lib/tabs'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useDuplicatesStore } from '@/stores/duplicates'
import Icon from './Icon.vue'
import UndoDeleteButton from './UndoDeleteButton.vue'

const duplicates = useDuplicatesStore()
const bookmarks = useBookmarksStore()
const { setPanel } = useDialogFocus(() => duplicates.open, () => duplicates.hide())
</script>

<template>
  <Teleport to="body">
    <div v-if="duplicates.open" class="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/35 p-4" @click.self="duplicates.hide()">
      <section :ref="setPanel" role="dialog" aria-modal="true" aria-labelledby="duplicate-title" tabindex="-1" class="glass-strong flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl text-slate-700 outline-none dark:text-slate-200">
        <header class="flex items-start justify-between gap-4 border-b border-slate-400/15 p-5">
          <div><h2 id="duplicate-title" class="text-lg font-semibold">{{ t('duplicateTitle') }}</h2><p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t('duplicateHint') }}</p></div>
          <button type="button" :disabled="duplicates.busy" :aria-label="t('close')" class="rounded-lg p-2 hover:bg-slate-500/10" @click="duplicates.hide()"><Icon name="x" /></button>
        </header>
        <div class="flex items-center justify-between gap-3 p-5 text-sm">
          <span>{{ t('duplicateSummary', { groups: duplicates.groups.length, n: duplicates.extraCount }) }}</span>
          <button type="button" :disabled="bookmarks.loading || duplicates.busy" class="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300" @click="bookmarks.load()">{{ t('duplicateRefresh') }}</button>
        </div>
        <p v-if="duplicates.error || bookmarks.error" role="alert" class="mx-5 mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{{ duplicates.error || t('loadError') }}</p>
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          <p v-if="!duplicates.groups.length" class="py-10 text-center text-sm text-slate-500">{{ bookmarks.loading ? t('loading') : t('duplicateEmpty') }}</p>
          <section v-for="group in duplicates.groups" :key="group.url" class="rounded-xl border border-slate-400/20">
            <div class="flex min-w-0 items-center justify-between gap-3 border-b border-slate-400/15 bg-slate-400/5 px-4 py-3">
              <p class="truncate text-xs" :title="group.url">{{ group.url }}</p><span class="shrink-0 text-xs tabular-nums">{{ t('duplicateCopies', { n: group.links.length }) }}</span>
            </div>
            <ul class="divide-y divide-slate-400/15">
              <li v-for="link in group.links" :key="link.id" class="flex items-center gap-3 p-4">
                <input type="checkbox" :checked="duplicates.isSelected(link)" :aria-label="t('duplicateSelect', { title: link.title })" :disabled="duplicates.busy || !duplicates.canSelect(link, group)" class="size-4 shrink-0 accent-emerald-500" @change="duplicates.toggle(link, ($event.target as HTMLInputElement).checked)" />
                <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium" :title="link.title">{{ link.title || link.url }}</p><p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" :title="link.folder">{{ link.folder }}</p></div>
                <span v-if="!duplicates.canSelect(link, group)" class="shrink-0 text-xs text-emerald-600 dark:text-emerald-300">{{ t('duplicateKept') }}</span>
                <button type="button" class="shrink-0 rounded-lg p-2 text-xs hover:bg-slate-500/10" @click="openUrl(link.url, true)">{{ t('linkCheckOpen') }}</button>
              </li>
            </ul>
          </section>
        </div>
        <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-400/15 p-5">
          <UndoDeleteButton :disabled="duplicates.busy" />
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ t('duplicateKeepOne') }}</span>
          <button type="button" :disabled="duplicates.busy || !duplicates.validSelection" class="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40" @click="duplicates.deleteSelected()">{{ t('linkCheckDeleteSelected', { n: duplicates.selected.length }) }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
