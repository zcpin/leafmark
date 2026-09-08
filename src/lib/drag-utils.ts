// 拖拽排序的纯逻辑：从落点坐标计算目标 {parentId, index}
// 与 DOM 解耦，便于单测；A4 拖拽的核心算法
import type { BookmarkNode } from './types'
import { findNode, getPath, isFolder } from './tree-utils'

export interface DropTarget {
  parentId: string
  index: number
}

export type CardDropZone = 'before' | 'inside' | 'after'

export function cardDropZone(pointerX: number, left: number, width: number, folder: boolean): CardDropZone {
  if (width <= 0) return folder ? 'inside' : 'after'
  const ratio = (pointerX - left) / width
  if (folder && ratio >= 0.25 && ratio <= 0.75) return 'inside'
  return ratio < 0.5 ? 'before' : 'after'
}

/** Chrome 使用移动前的插入索引，同目录移动由浏览器自行扣除源项。 */
function insertionTarget(tree: BookmarkNode[], sourceId: string, parentId: string, index: number): DropTarget | null {
  const source = findNode(tree, sourceId)
  const parent = findNode(tree, parentId)
  if (!source?.parentId || source.parentId === '0' || !parent || !isFolder(parent) || parentId === '0') return null
  if (getPath(tree, parentId).some((node) => node.id === sourceId)) return null
  const sourceIndex = parent.children?.findIndex((node) => node.id === sourceId) ?? -1
  if (source.parentId === parentId && (index === sourceIndex || index === sourceIndex + 1)) return null
  return { parentId, index }
}

export function resolveCardDrop(tree: BookmarkNode[], sourceId: string, targetId: string, zone: CardDropZone): DropTarget | null {
  if (sourceId === targetId) return null
  const target = findNode(tree, targetId)
  if (!target) return null
  if (zone === 'inside') return isFolder(target) ? insertionTarget(tree, sourceId, target.id, 0) : null
  if (!target.parentId) return null
  const siblings = findNode(tree, target.parentId)?.children ?? []
  const index = siblings.findIndex((node) => node.id === target.id)
  return index < 0 ? null : insertionTarget(tree, sourceId, target.parentId, index + (zone === 'after' ? 1 : 0))
}

export function resolveGridDrop(tree: BookmarkNode[], sourceId: string, parentId: string): DropTarget | null {
  const parent = findNode(tree, parentId)
  return parent ? insertionTarget(tree, sourceId, parentId, parent.children?.length ?? 0) : null
}

/**
 * @param nodes 当前同级的扁平节点列表（含文件夹与书签）
 * @param pointerY 拖拽指针相对容器顶部的 Y 坐标
 * @param rowHeights 每行等高（px）
 * @param columns 每行列数（网格换行后的列数）
 * @param parentId 这些节点的共同父 id
 */
export function computeDropIndex(
  nodes: BookmarkNode[],
  pointerY: number,
  rowHeight: number,
  columns: number,
  parentId: string,
): DropTarget {
  if (nodes.length === 0) return { parentId, index: 0 }
  const row = Math.max(0, Math.floor(pointerY / rowHeight))
  const maxRow = Math.floor((nodes.length - 1) / columns)
  const rowIndex = Math.min(row, maxRow)
  const baseIndex = rowIndex * columns
  return { parentId, index: baseIndex }
}

/**
 * 拖拽到空文件夹之上 → 进入该文件夹（parentId = 文件夹 id, index = 0）
 */
export function dropIntoFolder(folderId: string): DropTarget {
  return { parentId: folderId, index: 0 }
}

/** 拖拽落点是否落在「拖拽源自身位置」——避免无意义写回 */
export function isSamePosition(
  _sourceId: string,
  sourceParentId: string,
  sourceIndex: number,
  target: DropTarget,
): boolean {
  return target.parentId === sourceParentId && target.index === sourceIndex
}
