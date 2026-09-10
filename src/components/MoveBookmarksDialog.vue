<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useDialogFocus } from '@/composables/useDialogFocus'
import { moveDestinationIssue } from '@/lib/bookmark-move'
import { t, type MessageKey } from '@/lib/i18n'
import { flatten, getPath, isFolder } from '@/lib/tree-utils'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSelectionStore } from '@/stores/selection'
import Icon from './Icon.vue'

const bookmarks = useBookmarksStore()
const selection = useSelectionStore()
const destinationId = ref<string | null>(null)
const { setPanel, titleId } = useDialogFocus(() => selection.moveOpen, selection.closeMove)
const issueLabels: Record<NonNullable<ReturnType<typeof moveDestinationIssue>>, MessageKey> = {
  unavailable: 'moveFolderUnavailable',
  sameFolder: 'moveCurrentFolder',
  insideSelection: 'moveInsideSelection',
}
const folders = computed(() => flatten(bookmarks.tree)
  .filter(({ node }) => node.id !== '0' && isFolder(node))
  .map(({ node }) => ({
    id: node.id,
    title: node.title || `#${node.id}`,
    path: getPath(bookmarks.tree, node.id).filter((part) => part.id !== '0').map((part) => part.title || `#${part.id}`).join(' / '),
    issue: moveDestinationIssue(bookmarks.tree, selection.targets, node.id),
  })))
const destinationValid = computed(() => destinationId.value !== null &&
  selection.selected.length > 0 &&
  moveDestinationIssue(bookmarks.tree, selection.targets, destinationId.value) === null)

watch(() => selection.moveOpen, (open) => {
  if (open) destinationId.value = null
})

function move() {
  if (destinationValid.value && destinationId.value) void selection.moveTo(destinationId.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="selection.moveOpen" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-4" @click.self="selection.closeMove()">
      <section :ref="setPanel" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-busy="selection.busy" tabindex="-1" class="glass-strong flex max-h-[min(38rem,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl text-slate-700 shadow-2xl outline-none dark:text-slate-200">
        <header class="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div class="min-w-0">
            <h2 :id="titleId" class="text-base font-semibold">{{ t('batchMoveTitle', { n: selection.selected.length }) }}</h2>
            <p class="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{{ t('batchMoveHint') }}</p>
          </div>
          <button type="button" :aria-label="t('close')" :disabled="selection.busy" class="rounded-lg p-2 hover:bg-slate-500/10 disabled:opacity-40" @click="selection.closeMove()"><Icon name="x" /></button>
        </header>

        <div role="radiogroup" :aria-label="t('moveDestination')" class="bookmark-scroll min-h-0 flex-1 space-y-1 overflow-y-auto border-y border-slate-400/15 p-3">
          <label v-for="folder in folders" :key="folder.id" class="flex items-center gap-3 rounded-xl px-3 py-3" :class="folder.issue ? 'cursor-not-allowed opacity-50' : destinationId === folder.id ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-600/40' : 'cursor-pointer hover:bg-slate-500/5'">
            <input v-model="destinationId" type="radio" :name="titleId" :value="folder.id" :aria-label="folder.path" :disabled="selection.busy || selection.selected.length === 0 || !!folder.issue" class="size-4 shrink-0 accent-emerald-700 dark:accent-emerald-400" />
            <Icon name="folder" class="size-5 text-amber-600 dark:text-amber-400" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium" :title="folder.title">{{ folder.title }}</span>
              <span class="mt-1 block truncate text-xs text-slate-600 dark:text-slate-300" :title="folder.path">{{ folder.path }}</span>
              <span v-if="folder.issue" class="mt-1 block text-xs">{{ t(issueLabels[folder.issue]) }}</span>
            </span>
          </label>
        </div>

        <footer class="shrink-0 space-y-3 p-5">
          <p v-if="selection.error" role="alert" class="text-xs leading-relaxed text-red-700 dark:text-red-300">{{ selection.error }}</p>
          <p v-else-if="!selection.selected.length" role="alert" class="text-xs text-slate-600 dark:text-slate-300">{{ t('selectionChanged') }}</p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" :disabled="selection.busy" class="rounded-lg px-4 py-2 text-sm hover:bg-slate-500/10 disabled:opacity-40" @click="selection.closeMove()">{{ t('cancel') }}</button>
            <button type="button" :disabled="selection.busy || !destinationValid" class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300" @click="move">
              {{ selection.busy ? t('batchMoving') : t('batchMoveConfirm', { n: selection.selected.length }) }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
