// chrome.* 内存 mock：书签树 / 存储 / 标签页 / i18n
// 每个测试可通过 chromeMock.reset() 恢复初始状态
import { vi } from 'vitest'

import { DEV_BOOKMARK_TREE } from '@/lib/dev-fixtures'
import type { BookmarkNode } from '@/lib/types'

export const SAMPLE_TREE: BookmarkNode[] = DEV_BOOKMARK_TREE

type BookmarkListener = (...args: unknown[]) => void

function createEvent() {
  const listeners = new Set<BookmarkListener>()
  return {
    addListener: vi.fn((fn: BookmarkListener) => listeners.add(fn)),
    removeListener: vi.fn((fn: BookmarkListener) => listeners.delete(fn)),
    __emit: (...args: unknown[]) => listeners.forEach((fn) => fn(...args)),
    __clear: () => listeners.clear(),
    __size: () => listeners.size,
  }
}

function cloneTree(tree: BookmarkNode[]): BookmarkNode[] {
  return tree.map((n) => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }))
}

function cloneNode(node: BookmarkNode): BookmarkNode {
  return { ...node, children: node.children ? cloneTree(node.children) : undefined }
}

function makeChrome() {
  // —— 书签 ——
  const bookmarkState = { tree: cloneTree(SAMPLE_TREE) }
  const bookmarkEvents = {
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent(),
  }

  function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children) {
        const found = findNode(n.children, id)
        if (found) return found
      }
    }
    return undefined
  }

  function removeFromParent(tree: BookmarkNode[], id: string): BookmarkNode | null {
    const parent = findNode(tree, id)?.parentId
    const siblings = parent ? (findNode(tree, parent)?.children ?? []) : tree
    const idx = siblings.findIndex((n) => n.id === id)
    if (idx === -1) return null
    return siblings.splice(idx, 1)[0] ?? null
  }

  const bookmarks = {
    ...bookmarkEvents,
    getTree: vi.fn((cb: (nodes: BookmarkNode[]) => void) => cb(cloneTree(bookmarkState.tree))),
    getChildren: vi.fn((id: string, cb: (children: BookmarkNode[]) => void) => {
      cb(cloneTree(findNode(bookmarkState.tree, id)?.children ?? []))
    }),
    update: vi.fn((id: string, changes: { title?: string; url?: string }, cb: (node: BookmarkNode) => void) => {
      const node = findNode(bookmarkState.tree, id)
      if (node) Object.assign(node, changes)
      cb(node ? cloneNode(node) : (undefined as unknown as BookmarkNode))
      bookmarkEvents.onChanged.__emit(id, changes)
    }),
    remove: vi.fn((id: string, cb: () => void) => {
      const parentId = findNode(bookmarkState.tree, id)?.parentId
      removeFromParent(bookmarkState.tree, id)
      cb()
      bookmarkEvents.onRemoved.__emit(id, { parentId, index: 0 })
    }),
    removeTree: vi.fn((id: string, cb: () => void) => {
      const parentId = findNode(bookmarkState.tree, id)?.parentId
      removeFromParent(bookmarkState.tree, id)
      cb()
      bookmarkEvents.onRemoved.__emit(id, { parentId, index: 0 })
    }),
    move: vi.fn(
      (id: string, dest: { parentId: string; index?: number }, cb: (node: BookmarkNode) => void) => {
        const oldParentId = findNode(bookmarkState.tree, id)?.parentId
        const node = removeFromParent(bookmarkState.tree, id)
        const parent = findNode(bookmarkState.tree, dest.parentId)
        if (node && parent?.children) {
          parent.children.splice(dest.index ?? parent.children.length, 0, node)
          node.parentId = dest.parentId
        }
        cb(node ? cloneNode(node) : (undefined as unknown as BookmarkNode))
        bookmarkEvents.onMoved.__emit(id, { ...dest, oldParentId, oldIndex: 0 })
      },
    ),
    __find: (id: string) => findNode(bookmarkState.tree, id),
    __setTree: (tree: BookmarkNode[]) => {
      bookmarkState.tree = cloneTree(tree)
    },
  }

  // —— 存储 ——
  const storageState = { sync: new Map<string, unknown>(), local: new Map<string, unknown>() }
  const storageChanged = createEvent()

  function makeArea(name: 'sync' | 'local') {
    const store = storageState[name]
    return {
      get: vi.fn(
        (
          keys: string | string[] | Record<string, unknown> | null,
          cb: (items: Record<string, unknown>) => void,
        ) => {
          const result: Record<string, unknown> = {}
          if (keys === null || keys === undefined) {
            store.forEach((v, k) => (result[k] = v))
          } else if (typeof keys === 'string') {
            if (store.has(keys)) result[keys] = store.get(keys)
          } else if (Array.isArray(keys)) {
            keys.forEach((k) => {
              if (store.has(k)) result[k] = store.get(k)
            })
          } else {
            Object.entries(keys).forEach(([k, fallback]) => {
              result[k] = store.has(k) ? store.get(k) : fallback
            })
          }
          cb(result)
        },
      ),
      set: vi.fn((items: Record<string, unknown>, cb: () => void) => {
        const changes: Record<string, { newValue: unknown; oldValue: unknown }> = {}
        Object.entries(items).forEach(([k, v]) => {
          changes[k] = { newValue: v, oldValue: store.get(k) }
          store.set(k, v)
        })
        cb()
        storageChanged.__emit(changes, name)
      }),
    }
  }

  const chromeMock = {
    bookmarks,
    storage: {
      sync: makeArea('sync'),
      local: makeArea('local'),
      onChanged: storageChanged,
    },
    tabs: {
      create: vi.fn(
        (opts: { url: string; active?: boolean }, cb?: (tab: { id: number }) => void) => {
          cb?.({ id: 1 })
          return Promise.resolve({ id: 1 })
        },
      ),
    },
    runtime: {
      id: 'test-extension-id',
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://test-extension-id${path}`,
    },
    i18n: {
      getUILanguage: () => 'zh-CN',
      getMessage: (key: string) => `__msg_${key}__`,
    },
    __events: bookmarkEvents,
    __storage: storageState,
    __reset: () => {
      bookmarkState.tree = cloneTree(SAMPLE_TREE)
      storageState.sync.clear()
      storageState.local.clear()
      chromeMock.runtime.lastError = null
      Object.values(bookmarkEvents).forEach((e) => e.__clear())
      storageChanged.__clear()
      vi.clearAllMocks()
    },
  }

  return chromeMock
}

export const chromeMock = makeChrome()
