import { findNode, getPath } from './tree-utils'
import type { BookmarkNode } from './types'

export interface DeletionTarget { id: string; url?: string }
export interface DeletionResult { deleted: string[]; skipped: number; failed: number }
export interface UndoNode {
  id: string
  title: string
  url?: string
  children?: UndoNode[]
  restoredId?: string
}
export interface UndoEntry { parentId: string; index: number; node: UndoNode }
export interface UndoRecord { id: string; entries: UndoEntry[]; previous?: UndoEntry[] }

function snapshot(node: BookmarkNode): UndoNode {
  return { id: node.id, title: node.title, ...(node.url !== undefined ? { url: node.url } : { children: (node.children ?? []).map(snapshot) }) }
}

/** 保存删除前的完整快照；子项与父文件夹同时选中时只保存父项。 */
export function deletionEntries(tree: BookmarkNode[], targets: DeletionTarget[]): UndoEntry[] {
  const valid = new Map(targets.filter((target) => {
    const node = findNode(tree, target.id)
    return node && node.parentId && node.parentId !== '0' && node.url === target.url
  }).map((target) => [target.id, target]))
  return [...valid.values()].flatMap((target) => {
    const node = findNode(tree, target.id)!
    if (getPath(tree, node.id).slice(0, -1).some((ancestor) => valid.has(ancestor.id))) return []
    const siblings = findNode(tree, node.parentId!)?.children ?? []
    return [{ parentId: node.parentId!, index: siblings.findIndex((sibling) => sibling.id === node.id), node: snapshot(node) }]
  })
}
