// 书签搜索状态：查询词、防抖、范围、结果与开关
// 查询词与范围不持久化：每次打开新标签页都是干净状态。
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { MAX_SEARCH_RESULTS, searchBookmarks, type SearchHit } from '@/lib/bookmark-search'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from './bookmarks'

/** 输入防抖：连续输入不重复计算 */
const DEBOUNCE_MS = 120

export type SearchScope = 'all' | 'folder'

export const useSearchStore = defineStore('search', () => {
  const bookmarks = useBookmarksStore()

  const active = ref(false)
  /** 输入框里的原始值（立即更新） */
  const input = ref('')
  /** 防抖后真正参与匹配的查询词 */
  const query = ref('')
  const scope = ref<SearchScope>('all')

  let timer: ReturnType<typeof setTimeout> | undefined

  const matches = computed<SearchHit[]>(() => {
    if (!active.value || !query.value.trim()) return []
    // 「仅当前目录」从当前目录的子树开始搜，路径相对当前目录
    const roots: readonly BookmarkNode[] =
      scope.value === 'folder' ? bookmarks.currentChildren : bookmarks.tree
    return searchBookmarks(roots, query.value)
  })
  const results = computed(() => matches.value.slice(0, MAX_SEARCH_RESULTS))
  const total = computed(() => matches.value.length)
  const hiddenCount = computed(() => Math.max(0, total.value - results.value.length))
  /** 结果卡片副标题：node.id → 所在文件夹标题链 */
  const paths = computed<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>()
    for (const hit of results.value) map.set(hit.node.id, hit.path)
    return map
  })
  /** 是否已进入结果态（有查询词），主区据此在网格与结果视图之间切换 */
  const showing = computed(() => active.value && query.value.trim().length > 0)

  function cancelPending() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function setInput(value: string) {
    input.value = value
    cancelPending()
    timer = setTimeout(() => {
      timer = undefined
      query.value = input.value
    }, DEBOUNCE_MS)
  }

  function setScope(next: SearchScope) {
    scope.value = next
  }

  function clear() {
    cancelPending()
    input.value = ''
    query.value = ''
  }

  function open() {
    active.value = true
  }

  /** 收起搜索框：清空查询并把范围重置为全部书签 */
  function close() {
    cancelPending()
    active.value = false
    input.value = ''
    query.value = ''
    scope.value = 'all'
  }

  function dispose() {
    cancelPending()
  }

  // 切换目录（点击结果里的文件夹或路径）即结束搜索，避免结果视图与目录视图并存
  watch(
    () => bookmarks.currentFolder?.id,
    () => {
      if (active.value) close()
    },
  )

  return {
    active,
    input,
    query,
    scope,
    matches,
    results,
    total,
    hiddenCount,
    paths,
    showing,
    setInput,
    setScope,
    clear,
    open,
    close,
    dispose,
  }
})
