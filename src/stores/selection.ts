import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { isMovableBookmark } from '@/lib/bookmark-move'
import { t } from '@/lib/i18n'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from './bookmarks'
import { useUiStore } from './ui'

/** 多选仅作用于当前目录；切换目录即结束，避免移动屏幕外的旧选择。 */
export const useSelectionStore = defineStore('selection', () => {
  const bookmarks = useBookmarksStore()
  const ui = useUiStore()
  const active = ref(false)
  const folderId = ref<string | null>(null)
  const selectedIds = ref<string[]>([])
  const anchorId = ref<string | null>(null)
  const moveOpen = ref(false)
  const busy = ref(false)
  const error = ref('')

  const items = computed(() => bookmarks.currentChildren.filter(isMovableBookmark))
  const selected = computed(() => {
    const ids = new Set(selectedIds.value)
    return active.value ? items.value.filter((node) => ids.has(node.id)) : []
  })
  const targets = computed(() => selected.value.map((node) => ({ id: node.id, parentId: node.parentId! })))
  const allSelected = computed(() => items.value.length > 0 && selected.value.length === items.value.length)

  function end() {
    if (busy.value) return
    active.value = false
    folderId.value = null
    selectedIds.value = []
    anchorId.value = null
    moveOpen.value = false
    error.value = ''
  }

  function start(node?: BookmarkNode) {
    if (busy.value || (node && !isMovableBookmark(node))) return
    end()
    if (node?.parentId) bookmarks.setViewFolder(node.parentId)
    folderId.value = bookmarks.currentFolder?.id ?? null
    if (!folderId.value || items.value.length === 0) return
    active.value = true
    selectedIds.value = node ? [node.id] : []
    anchorId.value = node?.id ?? null
    bookmarks.draggingId = null
  }

  function toggle(id: string, range = false) {
    if (!active.value || busy.value || moveOpen.value) return
    const index = items.value.findIndex((node) => node.id === id)
    if (index < 0) return
    const anchor = items.value.findIndex((node) => node.id === anchorId.value)
    const ids = new Set(selectedIds.value)
    if (range && anchor >= 0) {
      for (const node of items.value.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)) ids.add(node.id)
    } else {
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      anchorId.value = id
    }
    selectedIds.value = [...ids]
  }

  function selectAll() {
    if (active.value && !busy.value && !moveOpen.value) selectedIds.value = items.value.map((node) => node.id)
  }

  function clear() {
    if (busy.value || moveOpen.value) return
    selectedIds.value = []
    anchorId.value = null
  }

  function openMove() {
    if (busy.value || selected.value.length === 0) return
    error.value = ''
    moveOpen.value = true
  }

  function closeMove() {
    if (!busy.value) moveOpen.value = false
  }

  async function moveTo(destinationId: string) {
    if (busy.value || !moveOpen.value || targets.value.length === 0) return
    busy.value = true
    error.value = ''
    try {
      const result = await bookmarks.moveBookmarks([...targets.value], destinationId)
      selectedIds.value = result.failed
      if (result.failed.length) {
        error.value = t('batchMovePartial', { n: result.moved.length, remaining: result.failed.length })
      } else {
        ui.toast(t('batchMoveResult', { n: result.moved.length, skipped: result.skipped.length }))
        busy.value = false
        end()
      }
    } catch {
      error.value = t('batchMoveFailed')
    } finally {
      busy.value = false
      if (active.value && bookmarks.currentFolder?.id !== folderId.value) end()
    }
  }

  watch(() => bookmarks.currentFolder?.id, (id) => {
    if (active.value && id !== folderId.value) end()
  }, { flush: 'sync' })
  watch(items, (nodes) => {
    if (busy.value) return
    const ids = new Set(nodes.map((node) => node.id))
    selectedIds.value = selectedIds.value.filter((id) => ids.has(id))
  })

  return {
    active, selectedIds, selected, targets, items, allSelected, moveOpen, busy, error,
    start, end, toggle, selectAll, clear, openMove, closeMove, moveTo,
  }
})
