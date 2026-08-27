// chrome.bookmarks 的 Promise 封装
// 非扩展环境（pnpm dev 预览）回退到示例树，保证 UI 可独立开发
import { DEV_BOOKMARK_TREE } from './dev-fixtures'
import { isExtensionEnv } from './env'
import type { BookmarkNode } from './types'

function cloneTree(tree: BookmarkNode[]): BookmarkNode[] {
  return tree.map((node) => ({
    ...node,
    children: node.children ? cloneTree(node.children) : undefined,
  }))
}

/** 回调式 chrome API → Promise，统一处理 lastError */
function call<T>(invoke: (callback: (result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(result)
    })
  })
}

export function getTree(): Promise<BookmarkNode[]> {
  if (!isExtensionEnv()) return Promise.resolve(cloneTree(DEV_BOOKMARK_TREE))
  return call<BookmarkNode[]>((cb) => chrome.bookmarks.getTree(cb)).then(
    (nodes) => nodes as unknown as BookmarkNode[],
  )
}

export function getChildren(folderId: string): Promise<BookmarkNode[]> {
  if (!isExtensionEnv()) {
    const tree = cloneTree(DEV_BOOKMARK_TREE)
    const found = findInTree(tree, folderId)
    return Promise.resolve(found?.children ?? [])
  }
  return call<BookmarkNode[]>((cb) => chrome.bookmarks.getChildren(folderId, cb)).then(
    (nodes) => nodes as unknown as BookmarkNode[],
  )
}

export function updateBookmark(
  id: string,
  changes: { title?: string; url?: string },
): Promise<BookmarkNode> {
  if (!isExtensionEnv()) return Promise.reject(new Error('not in extension env'))
  return call<BookmarkNode>((cb) => chrome.bookmarks.update(id, changes, cb)).then(
    (node) => node as unknown as BookmarkNode,
  )
}

/** recursive=true 删除文件夹及其全部内容（removeTree） */
export function removeBookmark(id: string, recursive = false): Promise<void> {
  if (!isExtensionEnv()) return Promise.reject(new Error('not in extension env'))
  const invoke = recursive ? chrome.bookmarks.removeTree : chrome.bookmarks.remove
  return call<void>((cb) => invoke(id, cb))
}

export function moveBookmark(
  id: string,
  destination: { parentId: string; index?: number },
): Promise<BookmarkNode> {
  if (!isExtensionEnv()) return Promise.reject(new Error('not in extension env'))
  return call<BookmarkNode>((cb) => chrome.bookmarks.move(id, destination, cb)).then(
    (node) => node as unknown as BookmarkNode,
  )
}

/** 聚合四类书签事件（增/删/改/移），任一触发即回调；返回取消订阅函数 */
export function onBookmarksChanged(listener: () => void): () => void {
  if (!isExtensionEnv()) return () => {}
  const events = [
    chrome.bookmarks.onCreated,
    chrome.bookmarks.onRemoved,
    chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved,
  ]
  events.forEach((event) => event.addListener(listener))
  return () => events.forEach((event) => event.removeListener(listener))
}

function findInTree(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findInTree(node.children, id)
      if (found) return found
    }
  }
  return undefined
}
