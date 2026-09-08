// 书签数据层：树加载、事件自动刷新、主视图状态、写回操作
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import {
  getTree as apiGetTree,
  moveBookmark as apiMoveBookmark,
  onBookmarksChanged,
  removeBookmark as apiRemoveBookmark,
  updateBookmark as apiUpdateBookmark,
} from '@/lib/chrome-bookmarks'
import { findNode, getPath, isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useSettingsStore } from './settings'

/** 递归收集文件夹下全部书签的 URL（含嵌套子文件夹） */
function collectUrls(node: BookmarkNode | undefined): string[] {
  if (!node) return []
  if (node.url) return [node.url]
  return (node.children ?? []).flatMap((child) => collectUrls(child))
}

export const useBookmarksStore = defineStore('bookmarks', () => {
  // Chrome 返回的是整棵不可变快照；只跟踪根数组替换，避免为大树建立深层代理。
  const tree = shallowRef<BookmarkNode[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  /** 侧栏树点击/面包屑跳转的当前视图（不持久化；null = 回退到主页文件夹） */
  const viewFolderId = ref<string | null>(null)
  const draggingId = ref<string | null>(null)

  const settings = useSettingsStore()

  /** 保存的主页目录；失效时保留选择，由视图回退到默认书签栏。 */
  const homeFolder = computed(() => {
    const node = findNode(tree.value, settings.homeFolderId ?? '1')
    return node && isFolder(node) ? node : undefined
  })
  const currentFolder = computed(() => {
    const viewed = viewFolderId.value ? findNode(tree.value, viewFolderId.value) : undefined
    return viewed ?? homeFolder.value ?? findNode(tree.value, '1')
  })
  const currentId = computed(() => currentFolder.value?.id ?? '1')
  const currentChildren = computed(() => currentFolder.value?.children ?? [])
  /** A6 面包屑：从根到当前视图的路径 */
  const breadcrumb = computed(() => getPath(tree.value, currentId.value))

  let unsubEvents: (() => void) | null = null
  let refreshPromise: Promise<void> | null = null
  let resolveRefresh: (() => void) | null = null
  let refreshRequested = false
  let refreshScheduled = false
  let refreshRunning = false

  /**
   * 请求一次最新快照：同一轮事件先合并，读取期间的新请求在当前读取结束后再补一次。
   * 这样写回触发的事件与写回后的显式刷新共享同一个 Promise，不会重复读取。
   */
  function load(): Promise<void> {
    refreshRequested = true
    if (!refreshPromise) {
      refreshPromise = new Promise<void>((resolve) => {
        resolveRefresh = resolve
      })
    }

    if (!refreshScheduled) {
      refreshScheduled = true
      setTimeout(() => {
        refreshScheduled = false
        void runRefresh()
      }, 0)
    }

    return refreshPromise
  }

  async function runRefresh() {
    if (refreshRunning) return
    refreshRunning = true
    loading.value = true
    try {
      while (refreshRequested) {
        refreshRequested = false
        error.value = null
        try {
          tree.value = await apiGetTree()
        } catch (e) {
          error.value = e instanceof Error ? e : new Error(String(e))
        }
      }
    } finally {
      refreshRunning = false
      loading.value = false
      const resolve = resolveRefresh
      resolveRefresh = null
      refreshPromise = null
      resolve?.()
      if (refreshRequested) void load()
    }
  }

  async function init() {
    await load()
    // 四类书签事件（原生管理器/同步等其他来源的变更）→ 自动刷新
    unsubEvents ??= onBookmarksChanged(() => {
      void load()
    })
  }

  function setViewFolder(id: string) {
    viewFolderId.value = id
  }

  /** 清除自定义主页和临时目录选择，回到默认书签栏。 */
  async function resetHomeFolder() {
    await settings.setHomeFolderId(null)
    viewFolderId.value = null
  }

  async function updateBookmark(id: string, changes: { title?: string; url?: string }) {
    await apiUpdateBookmark(id, changes)
    await load()
  }

  async function removeBookmark(id: string, recursive = false) {
    await apiRemoveBookmark(id, recursive)
    await load()
  }

  /** Phase 2 拖拽排序使用；提前就位 */
  async function moveBookmark(id: string, parentId: string, index: number) {
    await apiMoveBookmark(id, { parentId, index })
    await load()
  }

  /** 收集文件夹下全部书签 URL（B3 批量打开用） */
  function collectFolderUrls(folderId: string): string[] {
    return collectUrls(findNode(tree.value, folderId))
  }

  function dispose() {
    unsubEvents?.()
    unsubEvents = null
    draggingId.value = null
  }

  return {
    tree,
    loading,
    error,
    viewFolderId,
    draggingId,
    homeFolder,
    currentFolder,
    currentChildren,
    breadcrumb,
    init,
    load,
    setViewFolder,
    resetHomeFolder,
    updateBookmark,
    removeBookmark,
    moveBookmark,
    collectFolderUrls,
    dispose,
  }
})
