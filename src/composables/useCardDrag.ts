// A4 卡片拖拽（排序 / 移入文件夹）：HTML5 DnD，从 BookmarkCard 抽出
// 落点判定复用 drag-utils：dragover 的视觉提示与 drop 的实际移动必须用同一规则
import { ref, type Ref } from 'vue'

import { cardDropZone, resolveCardDrop, type CardDropZone } from '@/lib/drag-utils'
import { t } from '@/lib/i18n'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'

export interface UseCardDragOptions {
  /** 当前卡片节点；用 getter 保持 props 的响应式 */
  node: () => BookmarkNode
  isDir: () => boolean
  resultMode: () => boolean
  cardEl: Ref<HTMLElement | undefined>
  /** 拖拽开始时的副作用（关闭悬停面板） */
  onBegin?: () => void
}

export function useCardDrag(options: UseCardDragOptions) {
  const bookmarks = useBookmarksStore()
  const selection = useSelectionStore()
  const ui = useUiStore()

  const dragging = ref(false)
  const dropZone = ref<CardDropZone | null>(null)

  /** 多选态激活等场景下清掉落点提示 */
  function reset() {
    dropZone.value = null
  }

  function onDragStart(e: DragEvent) {
    if (selection.active) {
      e.preventDefault()
      return
    }
    dragging.value = true
    bookmarks.draggingId = options.node().id
    options.onBegin?.()
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', options.node().id)
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  function onDragEnd() {
    dragging.value = false
    dropZone.value = null
    if (bookmarks.draggingId === options.node().id) bookmarks.draggingId = null
  }

  function onDragOver(e: DragEvent) {
    if (selection.active || options.resultMode()) return
    const rect = options.cardEl.value?.getBoundingClientRect()
    if (!rect) return
    const zone = cardDropZone(e.clientX, rect.left, rect.width, options.isDir())
    const sourceId = bookmarks.draggingId || e.dataTransfer?.getData('text/plain')
    if (!sourceId || !resolveCardDrop(bookmarks.tree, sourceId, options.node().id, zone)) {
      dropZone.value = null
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
      return
    }
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dropZone.value = zone
  }

  function onDragLeave(e: DragEvent) {
    if (e.relatedTarget instanceof Node && options.cardEl.value?.contains(e.relatedTarget)) return
    dropZone.value = null
  }

  async function onDrop(e: DragEvent) {
    if (options.resultMode()) return
    e.preventDefault()
    if (selection.active) return
    const sourceId = e.dataTransfer?.getData('text/plain')
    const rect = options.cardEl.value?.getBoundingClientRect()
    // 拿不到几何信息时按「文件夹=移入、书签=排到后面」兜底
    const zone = rect
      ? cardDropZone(e.clientX, rect.left, rect.width, options.isDir())
      : options.isDir()
        ? 'inside'
        : 'after'
    dropZone.value = null
    try {
      if (!sourceId) return
      const destination = resolveCardDrop(bookmarks.tree, sourceId, options.node().id, zone)
      if (destination)
        await bookmarks.moveBookmark(sourceId, destination.parentId, destination.index)
    } catch {
      ui.toast(t('bookmarkMoveFailed'))
      await bookmarks.load()
    } finally {
      bookmarks.draggingId = null
    }
  }

  return { dragging, dropZone, reset, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }
}
