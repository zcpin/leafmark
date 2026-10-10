import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import { createBookmark, getChildren, removeBookmark } from '@/lib/chrome-bookmarks'
import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'
import { withBookmarkLock } from '@/lib/bookmark-lock'
import {
  binEntries,
  countBookmarks,
  deletionEntries,
  dropEntries,
  parseDeletionStack,
  pruneDeletionStack,
  DELETION_STACK_VERSION,
  type DeletionResult,
  type DeletionTarget,
  type DeletedNode,
  type DeletionRecord,
} from '@/lib/deletion-bin'
import { findNode, isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from './bookmarks'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'

/** 沿用 1.x 的存储键，改名会丢掉用户已保存的回收站记录 */
const KEY = 'bookmarkUndo'
class BinPersistenceError extends Error {}

/** 回收站里的一条记录：视图直接消费的结构 */
export interface BinItem {
  /** 删除前的书签 id，也是回收站条目的定位键 */
  id: string
  title: string
  url?: string
  isFolder: boolean
  /** 文件夹内的书签数量；单个书签为 1 */
  count: number
  /** 删除时所在目录名 */
  folder: string
  deletedAt: number
}

/**
 * 保存回收站（最新在前）。配额不足时丢弃最旧的记录而不是整批放弃；
 * 只有「一条都写不进去」才向上抛出，删除流程据此中止。
 * 返回真正落库的记录，调用方据此同步内存栈——回退掉的旧记录不能留在内存里。
 */
async function saveStack(records: readonly DeletionRecord[]): Promise<DeletionRecord[]> {
  let next = pruneDeletionStack(records)
  for (;;) {
    try {
      await storageSet(
        KEY,
        next.length ? { version: DELETION_STACK_VERSION, records: next } : null,
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
  /** 回收站记录，最新在前；一次删除就是一批 */
  const stack = shallowRef<DeletionRecord[]>([])
  const busy = ref(false)
  const binOpen = ref(false)
  /** 展平后的回收站条目，最新在前 */
  const items = computed<BinItem[]>(() =>
    binEntries(stack.value).map((entry) => ({
      id: entry.node.id,
      title: entry.node.title || entry.node.url || '',
      ...(entry.node.url !== undefined ? { url: entry.node.url } : {}),
      isFolder: entry.node.url === undefined,
      count: countBookmarks(entry.node),
      folder: folderLabel(entry.parentId, entry.parentTitle),
      deletedAt: entry.deletedAt,
    })),
  )
  /** 回收站条目总数（跨批次） */
  const count = computed(() => items.value.length)
  /** 批次数 */
  const depth = computed(() => stack.value.length)
  let initPromise: Promise<void> | null = null
  let unsubscribe: (() => void) | null = null

  /** 目录名优先取当前树（重命名后同步），目录已删除则用删除时记录的名字。 */
  function folderLabel(parentId: string, fallback?: string): string {
    const node = findNode(bookmarks.tree, parentId)
    if (node?.title) return node.title
    if (fallback) return fallback
    return parentId === '1' ? t('bookmarksBar') : t('otherBookmarks')
  }

  /** 过滤掉已经存在的项；整批都无需恢复的记录直接丢弃，露出更早的那批。 */
  function recoverStack(value: unknown): DeletionRecord[] {
    const records: DeletionRecord[] = []
    for (const record of parseDeletionStack(value)) {
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

  /** 重新读取本地记录（打开回收站、跨页面变更后使用） */
  async function refresh(): Promise<void> {
    await init()
    if (busy.value) return
    const saved = await storageGet<unknown>(KEY, null, 'local')
    await bookmarks.load()
    if (!bookmarks.error && !busy.value) stack.value = recoverStack(saved)
  }

  function showBin() {
    binOpen.value = true
    void refresh().catch(() => {})
  }

  function hideBin() {
    binOpen.value = false
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
        const prepared: DeletionRecord = {
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
    node: DeletedNode,
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

  /** 恢复回收站里的指定条目（按删除前的节点 id 定位），可跨批次选择。 */
  async function restore(ids: string[]) {
    await init()
    const wanted = new Set(ids)
    if (busy.value || !wanted.size) return
    busy.value = true
    try {
      await withBookmarkLock(async () => {
        const saved = await storageGet<unknown>(KEY, null, 'local')
        await bookmarks.load()
        if (bookmarks.error) throw bookmarks.error
        const working = recoverStack(saved)
        stack.value = working
        const targets = binEntries(working).filter((entry) => wanted.has(entry.node.id))
        if (!targets.length) {
          ui.toast(t('binItemMissing'))
          return
        }
        // 按批次归组：每批各自维护已恢复 id，避免把原有的重复书签合并。
        const selectedByRecord = new Map<string, Set<string>>()
        for (const entry of targets) {
          const selected = selectedByRecord.get(entry.recordId) ?? new Set<string>()
          selected.add(entry.node.id)
          selectedByRecord.set(entry.recordId, selected)
        }
        const restoredIds: string[] = []
        let pending = 0
        for (const record of working) {
          const selected = selectedByRecord.get(record.id)
          if (!selected) continue
          const claimed = new Set(record.restoredIds ?? [])
          const checkpoint = async () => {
            record.restoredIds = [...claimed]
            try {
              await saveStack(working)
            } catch {
              throw new BinPersistenceError('Cannot save restore progress')
            }
          }
          function collectRestored(node: DeletedNode) {
            if (node.restoredId) claimed.add(node.restoredId)
            node.children?.forEach(collectRestored)
          }
          record.entries.forEach((entry) => collectRestored(entry.node))
          const entries = [...record.entries]
            .filter((entry) => selected.has(entry.node.id))
            .sort((a, b) => a.parentId.localeCompare(b.parentId) || a.index - b.index)
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
              restoredIds.push(entry.node.id)
            } catch (error) {
              if (error instanceof BinPersistenceError) throw error
              pending++
            }
          }
        }
        // 已恢复的条目出栈，失败的条目留在回收站里可重试。
        const nextStack = dropEntries(working, new Set(restoredIds))
        await saveStack(nextStack)
        stack.value = nextStack
        await bookmarks.load()
        ui.toast(t('restoreResult', { n: restoredIds.length, remaining: pending }))
      })
    } catch {
      ui.toast(t('restoreFailed'))
    } finally {
      busy.value = false
    }
  }

  /** 从回收站彻底移除；移除后无法再恢复。 */
  async function discard(ids: string[]) {
    await init()
    const wanted = new Set(ids)
    if (busy.value || !wanted.size) return
    busy.value = true
    try {
      await withBookmarkLock(async () => {
        const working = recoverStack(await storageGet<unknown>(KEY, null, 'local'))
        const nextStack = dropEntries(working, wanted)
        const before = working.reduce((sum, record) => sum + record.entries.length, 0)
        const after = nextStack.reduce((sum, record) => sum + record.entries.length, 0)
        await saveStack(nextStack)
        stack.value = nextStack
        ui.toast(t('binDiscardResult', { n: before - after }))
      })
    } catch {
      ui.toast(t('restoreFailed'))
    } finally {
      busy.value = false
    }
  }

  /** 清空回收站 */
  async function clear() {
    if (!items.value.length) return
    await discard(items.value.map((item) => item.id))
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
    initPromise = null
    binOpen.value = false
  }
  return {
    busy,
    binOpen,
    items,
    count,
    depth,
    init,
    refresh,
    showBin,
    hideBin,
    remove,
    restore,
    discard,
    clear,
    dispose,
  }
})
