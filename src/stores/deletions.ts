import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import { createBookmark, getChildren, removeBookmark } from '@/lib/chrome-bookmarks'
import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'
import { withBookmarkLock } from '@/lib/bookmark-lock'
import {
  deletionEntries,
  parseUndoStack,
  pruneUndoStack,
  UNDO_STACK_VERSION,
  type DeletionResult,
  type DeletionTarget,
  type UndoEntry,
  type UndoNode,
  type UndoRecord,
} from '@/lib/bookmark-undo'
import { findNode, isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from './bookmarks'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'

const KEY = 'bookmarkUndo'
class UndoPersistenceError extends Error {}

/**
 * 保存撤销栈（最新在前）。配额不足时丢弃最旧的记录而不是整批放弃；
 * 只有「一条都写不进去」才向上抛出，删除流程据此中止。
 * 返回真正落库的记录，调用方据此同步内存栈——回退掉的旧记录不能留在内存里。
 */
async function saveStack(records: readonly UndoRecord[]): Promise<UndoRecord[]> {
  let next = pruneUndoStack(records)
  for (;;) {
    try {
      await storageSet(
        KEY,
        next.length ? { version: UNDO_STACK_VERSION, records: next } : null,
        'local',
      )
      return next
    } catch (error) {
      if (next.length <= 1) throw error
      next = next.slice(0, -1)
    }
  }
}

export const useDeletionsStore = defineStore('deletions', () => {
  const bookmarks = useBookmarksStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  /** 撤销栈，最新在前；一次撤销只处理栈顶那批 */
  const stack = shallowRef<UndoRecord[]>([])
  const busy = ref(false)
  const undoCount = computed(() => stack.value[0]?.entries.length ?? 0)
  const undoDepth = computed(() => stack.value.length)
  let initPromise: Promise<void> | null = null
  let unsubscribe: (() => void) | null = null

  /** 过滤掉已经存在的项；整批都无需恢复的记录直接丢弃，露出更早的那批。 */
  function recoverStack(value: unknown): UndoRecord[] {
    const records: UndoRecord[] = []
    for (const record of parseUndoStack(value)) {
      const entries = record.entries.filter((entry) => !findNode(bookmarks.tree, entry.node.id))
      if (entries.length) records.push({ ...record, entries })
    }
    return records
  }

  function init(): Promise<void> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        await settings.init()
        const saved = await storageGet<unknown>(KEY, null, 'local')
        await bookmarks.load()
        if (!bookmarks.error) stack.value = recoverStack(saved)
        unsubscribe ??= onStorageChanged((key, value) => {
          if (key !== KEY || busy.value) return
          void bookmarks.load().then(() => {
            if (!bookmarks.error && !busy.value) stack.value = recoverStack(value)
          })
        }, 'local')
      } catch {
        // 无法读取记录不影响浏览书签；删除时会再次验证本地存储可写。
        initPromise = null
      }
    })()
    return initPromise
  }

  async function remove(
    targets: DeletionTarget[],
    guard?: (tree: BookmarkNode[]) => boolean,
  ): Promise<DeletionResult> {
    if (busy.value) throw new Error('Deletion in progress')
    await init()
    if (!settings.ready) throw new Error('Settings unavailable')
    if (busy.value) throw new Error('Deletion in progress')
    busy.value = true
    try {
      return await withBookmarkLock(async () => {
        await bookmarks.load()
        if (bookmarks.error) throw bookmarks.error
        const older = recoverStack(await storageGet<unknown>(KEY, null, 'local'))
        stack.value = older
        if (guard && !guard(bookmarks.tree)) throw new Error('Bookmarks changed')
        const entries = deletionEntries(bookmarks.tree, targets)
        const result: DeletionResult = {
          deleted: [],
          skipped: targets.length - entries.length,
          failed: 0,
        }
        if (!entries.length) return result
        const prepared: UndoRecord = {
          id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`,
          entries,
        }
        // 先持久化再删除；如果页面中断，可按原 id 是否存在恢复成功删除的项。
        const persisted = await saveStack([prepared, ...older])
        // 配额不足时末尾的旧记录会被丢弃，内存栈必须与落库结果一致。
        const kept = persisted.slice(1)
        for (const entry of entries) {
          try {
            await removeBookmark(entry.node.id, entry.node.url === undefined)
            result.deleted.push(entry.node.id)
          } catch {
            result.failed++
          }
        }
        stack.value = result.deleted.length
          ? [
              {
                id: prepared.id,
                entries: entries.filter((entry) => result.deleted.includes(entry.node.id)),
              },
              ...kept,
            ]
          : kept
        // 即使此处写入失败，预先保存的快照仍可恢复；未删除项通过原 id 过滤。
        await saveStack(stack.value).catch(() => {})
        await bookmarks.load()
        return result
      })
    } finally {
      busy.value = false
    }
  }

  async function restoreNode(
    node: UndoNode,
    parentId: string,
    index: number,
    checkpoint: () => Promise<void>,
    claimed: Set<string>,
  ): Promise<void> {
    const siblings = await getChildren(parentId)
    let existing = node.restoredId
      ? (findNode(bookmarks.tree, node.restoredId) ??
        siblings.find((sibling) => sibling.id === node.restoredId))
      : undefined
    if (!existing) {
      if (node.pendingCreate?.parentId === parentId) {
        const before = new Set(node.pendingCreate.siblingIds)
        const candidates = siblings.filter(
          (sibling) =>
            !before.has(sibling.id) &&
            !claimed.has(sibling.id) &&
            sibling.title === node.title &&
            sibling.url === node.url,
        )
        // 无法唯一识别时保留记录供重试，不能猜测或继续创建副本。
        if (candidates.length > 1) throw new Error('Ambiguous restored bookmark')
        existing = candidates[0]
      }
      if (!existing) {
        node.pendingCreate = { parentId, siblingIds: siblings.map((sibling) => sibling.id) }
        await checkpoint()
        existing = await createBookmark({
          parentId,
          index: Math.min(index, siblings.length),
          title: node.title,
          ...(node.url !== undefined ? { url: node.url } : {}),
        })
      }
      node.restoredId = existing.id
      claimed.add(existing.id)
      node.pendingCreate = undefined
      await checkpoint()
    }
    if (settings.homeFolderId === node.id) await settings.setHomeFolderId(node.restoredId!)
    if (settings.linkCheckOptions.folderId === node.id)
      await settings.setLinkCheckOptions({ folderId: node.restoredId! })
    if (bookmarks.viewFolderId === node.id) bookmarks.setViewFolder(node.restoredId!)
    for (const [childIndex, child] of (node.children ?? []).entries()) {
      await restoreNode(child, node.restoredId!, childIndex, checkpoint, claimed)
    }
  }

  async function undo() {
    await init()
    if (busy.value || !stack.value.length) return
    const expectedId = stack.value[0].id
    busy.value = true
    try {
      await withBookmarkLock(async () => {
        const saved = await storageGet<unknown>(KEY, null, 'local')
        await bookmarks.load()
        if (bookmarks.error) throw bookmarks.error
        if (parseUndoStack(saved)[0]?.id !== expectedId) {
          stack.value = recoverStack(saved)
          ui.toast(t('undoRecordChanged'))
          return
        }
        const working = recoverStack(saved)
        stack.value = working
        const top = working[0]
        if (!top) return
        const older = working.slice(1)
        const claimed = new Set(top.restoredIds ?? [])
        const checkpoint = async () => {
          top.restoredIds = [...claimed]
          try {
            await saveStack([top, ...older])
          } catch {
            throw new UndoPersistenceError('Cannot save restore progress')
          }
        }
        function collectRestored(node: UndoNode) {
          if (node.restoredId) claimed.add(node.restoredId)
          node.children?.forEach(collectRestored)
        }
        top.entries.forEach((entry) => collectRestored(entry.node))
        const pending: UndoEntry[] = []
        let restored = 0
        const entries = [...top.entries].sort(
          (a, b) => a.parentId.localeCompare(b.parentId) || a.index - b.index,
        )
        for (const entry of entries) {
          if (findNode(bookmarks.tree, entry.node.id)) continue
          try {
            const parent = findNode(bookmarks.tree, entry.parentId)
            await restoreNode(
              entry.node,
              parent && isFolder(parent) ? parent.id : '1',
              entry.index,
              checkpoint,
              claimed,
            )
            restored++
          } catch (error) {
            if (error instanceof UndoPersistenceError) throw error
            pending.push(entry)
          }
        }
        // 本批全部恢复则弹出栈顶，露出更早的删除；否则把未完成的项留在栈顶。
        const nextStack = pending.length
          ? [{ id: top.id, entries: pending, restoredIds: [...claimed] }, ...older]
          : older
        await saveStack(nextStack)
        stack.value = nextStack
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
  return { busy, undoCount, undoDepth, init, remove, undo, dispose }
})
