<script setup lang="ts">
// 当前文件夹内容的卡片网格（A3）+ 空白区拖放（A4：拖到网格空白 → 移到末尾）
import { computed, ref } from 'vue'

import { t } from '@/lib/i18n'
import { resolveGridDrop } from '@/lib/drag-utils'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useUiStore } from '@/stores/ui'
import { useSelectionStore } from '@/stores/selection'

import BookmarkCard from './BookmarkCard.vue'

const bookmarks = useBookmarksStore()
const ui = useUiStore()
const selection = useSelectionStore()
const children = computed(() => bookmarks.currentChildren)

const dropOverGrid = ref(false)

function onGridDragOver(e: DragEvent) {
  if (selection.active) return
  const sourceId = bookmarks.draggingId || e.dataTransfer?.getData('text/plain')
  if (!sourceId || !bookmarks.currentFolder || !resolveGridDrop(bookmarks.tree, sourceId, bookmarks.currentFolder.id)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropOverGrid.value = true
}

/** 拖到空白区：移到当前文件夹末尾 */
async function onGridDrop(e: DragEvent) {
  e.preventDefault()
  dropOverGrid.value = false
  if (selection.active) return
  const sourceId = e.dataTransfer?.getData('text/plain')
  const parentId = bookmarks.currentFolder?.id
  try {
    if (!sourceId || !parentId) return
    const target = resolveGridDrop(bookmarks.tree, sourceId, parentId)
    if (target) await bookmarks.moveBookmark(sourceId, target.parentId, target.index)
  } catch {
    ui.toast(t('bookmarkMoveFailed'))
    await bookmarks.load()
  } finally {
    bookmarks.draggingId = null
  }
}
</script>

<template>
  <div v-if="children.length === 0" class="flex h-full flex-col items-center justify-center gap-2 py-20 text-center" :class="{ 'rounded-2xl ring-2 ring-emerald-400': dropOverGrid }" @dragover="onGridDragOver" @dragleave="dropOverGrid = false" @drop="onGridDrop">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-12 text-slate-300 dark:text-slate-600">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
    <p class="text-sm font-medium text-slate-500 dark:text-slate-400">{{ t('emptyFolder') }}</p>
    <p class="text-xs text-slate-400 dark:text-slate-500">{{ t('emptyFolderHint') }}</p>
  </div>

  <div
    v-else
    class="grid gap-3"
    :class="{ 'rounded-2xl ring-2 ring-dashed ring-emerald-400/50': dropOverGrid }"
    :style="{
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, var(--lm-card-width, 200px)), 1fr))`,
    }"
    @dragover="onGridDragOver"
    @dragleave="dropOverGrid = false"
    @drop="onGridDrop"
  >
    <BookmarkCard v-for="node in children" :key="node.id" :node="node" />
  </div>
</template>
