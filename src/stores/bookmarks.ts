// 书签数据层：树加载、事件自动刷新、主视图状态、写回操作
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  getTree as apiGetTree,
  moveBookmark as apiMoveBookmark,
  onBookmarksChanged,
  removeBookmark as apiRemoveBookmark,
  updateBookmark as apiUpdateBookmark,
} from '@/lib/chrome-bookmarks'
import { findNode, getPath } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useSettingsStore } from './settings'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const tree = ref<BookmarkNode[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  /** 侧栏树点击/面包屑跳转的当前视图（不持久化；null = 回退到主页文件夹） */
  const viewFolderId = ref<string | null>(null)

  const settings = useSettingsStore()

  const currentId = computed(() => viewFolderId.value ?? settings.homeFolderId ?? '1')
  const currentFolder = computed(() => findNode(tree.value, currentId.value))
  const currentChildren = computed(() => currentFolder.value?.children ?? [])
  /** A6 面包屑：从根到当前视图的路径 */
  const breadcrumb = computed(() => getPath(tree.value, currentId.value))

  let unsubEvents: (() => void) | null = null

  async function load() {
    loading.value = true
    error.value = null
    try {
      tree.value = await apiGetTree()
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
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

  function dispose() {
    unsubEvents?.()
    unsubEvents = null
  }

  return {
    tree,
    loading,
    error,
    viewFolderId,
    currentFolder,
    currentChildren,
    breadcrumb,
    init,
    load,
    setViewFolder,
    updateBookmark,
    removeBookmark,
    moveBookmark,
    dispose,
  }
})
