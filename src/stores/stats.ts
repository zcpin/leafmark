// 底部书签统计（仅遍历本地书签树计数，无 network/history 依赖，商店合规）
import { computed } from 'vue'
import { defineStore } from 'pinia'

import { useBookmarksStore } from './bookmarks'

export const useStatsStore = defineStore('stats', () => {
  const bookmarks = useBookmarksStore()

  /** 全树书签总数（含嵌套子文件夹） */
  const total = computed(() => {
    const tree = bookmarks.tree
    if (tree.length === 0) return 0
    let n = 0
    const walk = (nodes: typeof tree) => {
      for (const node of nodes) {
        if (node.url) n++
        if (node.children) walk(node.children)
      }
    }
    walk(tree)
    return n
  })

  return { total }
})