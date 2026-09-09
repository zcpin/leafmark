import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import { createBookmark, getChildren, removeBookmark } from '@/lib/chrome-bookmarks'
import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'
import { withBookmarkLock } from '@/lib/bookmark-lock'
import { deletionEntries, type DeletionResult, type DeletionTarget, type UndoEntry, type UndoNode, type UndoRecord } from '@/lib/bookmark-undo'
import { findNode, isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from './bookmarks'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'

const KEY = 'bookmarkUndo'
class UndoPersistenceError extends Error {}

function saveRecord(value: UndoRecord | null) {
  return storageSet(KEY, value ? JSON.parse(JSON.stringify(value)) : null, 'local')
}

export const useDeletionsStore = defineStore('deletions', () => {
  const bookmarks = useBookmarksStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const record = shallowRef<UndoRecord | null>(null)
  const busy = ref(false)
  const undoCount = computed(() => record.value?.entries.length ?? 0)
  let initPromise: Promise<void> | null = null
  let unsubscribe: (() => void) | null = null

  function recover(value: UndoRecord | null): UndoRecord | null {
    if (!value?.entries || !Array.isArray(value.entries)) return null
    const missing = value.entries.filter((entry) => !findNode(bookmarks.tree, entry.node.id))
    const entries = missing.length ? missing : (value.previous ?? []).filter((entry) => !findNode(bookmarks.tree, entry.node.id))
    return entries.length ? { id: value.id, entries, restoredIds: missing.length ? value.restoredIds : value.previousRestoredIds } : null
  }

  function init(): Promise<void> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        await settings.init()
        const saved = await storageGet<UndoRecord | null>(KEY, null, 'local')
        await bookmarks.load()
        if (!bookmarks.error) record.value = recover(saved)
        unsubscribe ??= onStorageChanged((key, value) => {
          if (key !== KEY || busy.value) return
          void bookmarks.load().then(() => {
            if (!bookmarks.error && !busy.value) record.value = recover(value as UndoRecord | null)
          })
        }, 'local')
      } catch {
        // 无法读取记录不影响浏览书签；删除时会再次验证本地存储可写。
        initPromise = null
      }
    })()
    return initPromise
  }

  async function remove(targets: DeletionTarget[], guard?: (tree: BookmarkNode[]) => boolean): Promise<DeletionResult> {
    if (busy.value) throw new Error('Deletion in progress')
    await init()
    if (!settings.ready) throw new Error('Settings unavailable')
    if (busy.value) throw new Error('Deletion in progress')
    busy.value = true
    try {
      return await withBookmarkLock(async () => {
        await bookmarks.load()
        if (bookmarks.error) throw bookmarks.error
        record.value = recover(await storageGet<UndoRecord | null>(KEY, null, 'local'))
        if (guard && !guard(bookmarks.tree)) throw new Error('Bookmarks changed')
        const entries = deletionEntries(bookmarks.tree, targets)
        const result: DeletionResult = { deleted: [], skipped: targets.length - entries.length, failed: 0 }
        if (!entries.length) return result
        const previous = record.value
        const prepared: UndoRecord = { id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`, entries, previous: previous?.entries, previousRestoredIds: previous?.restoredIds }
        // 先持久化再删除；如果页面中断，可按原 id 是否存在恢复成功删除的项。
        await saveRecord(prepared)
        for (const entry of entries) {
          try {
            await removeBookmark(entry.node.id, entry.node.url === undefined)
            result.deleted.push(entry.node.id)
          } catch {
            result.failed++
          }
        }
        record.value = result.deleted.length
          ? { id: prepared.id, entries: entries.filter((entry) => result.deleted.includes(entry.node.id)) }
          : previous
        // 即使此处写入失败，预先保存的快照仍可恢复；未删除项通过原 id 过滤。
        await saveRecord(record.value).catch(() => {})
        await bookmarks.load()
        return result
      })
    } finally {
      busy.value = false
    }
  }

  async function restoreNode(node: UndoNode, parentId: string, index: number, checkpoint: () => Promise<void>, claimed: Set<string>): Promise<void> {
    const siblings = await getChildren(parentId)
    let existing = node.restoredId
      ? findNode(bookmarks.tree, node.restoredId) ?? siblings.find((sibling) => sibling.id === node.restoredId)
      : undefined
    if (!existing) {
      if (node.pendingCreate?.parentId === parentId) {
        const before = new Set(node.pendingCreate.siblingIds)
        const candidates = siblings.filter((sibling) => !before.has(sibling.id) && !claimed.has(sibling.id) && sibling.title === node.title && sibling.url === node.url)
        // 无法唯一识别时保留记录供重试，不能猜测或继续创建副本。
        if (candidates.length > 1) throw new Error('Ambiguous restored bookmark')
        existing = candidates[0]
      }
      if (!existing) {
        node.pendingCreate = { parentId, siblingIds: siblings.map((sibling) => sibling.id) }
        await checkpoint()
        existing = await createBookmark({ parentId, index: Math.min(index, siblings.length), title: node.title, ...(node.url !== undefined ? { url: node.url } : {}) })
      }
      node.restoredId = existing.id
      claimed.add(existing.id)
      node.pendingCreate = undefined
      await checkpoint()
    }
    if (settings.homeFolderId === node.id) await settings.setHomeFolderId(node.restoredId!)
    if (settings.linkCheckOptions.folderId === node.id) await settings.setLinkCheckOptions({ folderId: node.restoredId! })
    if (bookmarks.viewFolderId === node.id) bookmarks.setViewFolder(node.restoredId!)
    for (const [childIndex, child] of (node.children ?? []).entries()) {
      await restoreNode(child, node.restoredId!, childIndex, checkpoint, claimed)
    }
  }

  async function undo() {
    await init()
    if (busy.value || !record.value) return
    const expectedId = record.value.id
    busy.value = true
    try {
      await withBookmarkLock(async () => {
        const saved = await storageGet<UndoRecord | null>(KEY, null, 'local')
        await bookmarks.load()
        if (bookmarks.error) throw bookmarks.error
        if (saved?.id !== expectedId) {
          record.value = recover(saved)
          ui.toast(t('undoRecordChanged'))
          return
        }
        const working = recover(saved)
        record.value = working
        if (!working) return
        const claimed = new Set(working.restoredIds ?? [])
        const checkpoint = async () => {
          working.restoredIds = [...claimed]
          try { await saveRecord(working) }
          catch { throw new UndoPersistenceError('Cannot save restore progress') }
        }
        function collectRestored(node: UndoNode) {
          if (node.restoredId) claimed.add(node.restoredId)
          node.children?.forEach(collectRestored)
        }
        working.entries.forEach((entry) => collectRestored(entry.node))
        const pending: UndoEntry[] = []
        let restored = 0
        const entries = [...working.entries].sort((a, b) => a.parentId.localeCompare(b.parentId) || a.index - b.index)
        for (const entry of entries) {
          if (findNode(bookmarks.tree, entry.node.id)) continue
          try {
            const parent = findNode(bookmarks.tree, entry.parentId)
            await restoreNode(entry.node, parent && isFolder(parent) ? parent.id : '1', entry.index, checkpoint, claimed)
            restored++
          } catch (error) {
            if (error instanceof UndoPersistenceError) throw error
            pending.push(entry)
          }
        }
        const nextRecord = pending.length ? { id: working.id, entries: pending, restoredIds: [...claimed] } : null
        await saveRecord(nextRecord)
        record.value = nextRecord
        await bookmarks.load()
        ui.toast(t('undoResult', { n: restored, remaining: pending.length }))
      })
    } catch {
      ui.toast(t('undoFailed'))
    } finally {
      busy.value = false
    }
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
    initPromise = null
  }
  return { busy, undoCount, init, remove, undo, dispose }
})
