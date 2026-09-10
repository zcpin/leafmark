import { getTree, moveBookmark } from './chrome-bookmarks'
import { withBookmarkLock } from './bookmark-lock'
import { findNode, getPath, isFolder } from './tree-utils'
import type { BookmarkNode } from './types'

export interface BookmarkMoveTarget {
  id: string
  parentId: string
}

export interface BookmarkMoveResult {
  moved: string[]
  skipped: string[]
  failed: string[]
}

export function isMovableBookmark(node: BookmarkNode): boolean {
  return !!node.parentId && node.parentId !== '0' && !node.unmodifiable
}

/** 目标目录校验同时供选择器和实际写回使用。 */
export function moveDestinationIssue(
  tree: BookmarkNode[],
  targets: readonly BookmarkMoveTarget[],
  folderId: string,
): 'unavailable' | 'sameFolder' | 'insideSelection' | null {
  const folder = findNode(tree, folderId)
  if (!folder || !isFolder(folder) || folder.id === '0') return 'unavailable'
  const path = getPath(tree, folderId)
  if (path.some((node) => node.unmodifiable)) return 'unavailable'
  if (path.some((node) => targets.some((target) => target.id === node.id))) return 'insideSelection'
  if (targets.length > 0 && targets.every((target) => target.parentId === folderId)) return 'sameFolder'
  return null
}

/**
 * 在共享写锁内读取最新树，再依次追加到目标目录，保留所选项目的展示顺序。
 * Chrome 没有批量移动事务：成功项不重复执行，失败项由调用方保留以便重试。
 */
export function moveBookmarks(
  targets: readonly BookmarkMoveTarget[],
  folderId: string,
): Promise<BookmarkMoveResult> {
  return withBookmarkLock(async () => {
    const tree = await getTree()
    const issue = moveDestinationIssue(tree, targets, folderId)
    if (issue && issue !== 'sameFolder') throw new Error(`Invalid move destination: ${issue}`)

    const result: BookmarkMoveResult = { moved: [], skipped: [], failed: [] }
    const seen = new Set<string>()
    for (const target of targets) {
      if (seen.has(target.id)) continue
      seen.add(target.id)
      const node = findNode(tree, target.id)
      if (
        !node || !isMovableBookmark(node) || node.parentId !== target.parentId ||
        node.parentId === folderId || getPath(tree, node.id).some((ancestor) => ancestor.unmodifiable)
      ) {
        result.skipped.push(target.id)
        continue
      }
      try {
        await moveBookmark(target.id, { parentId: folderId })
        result.moved.push(target.id)
      } catch {
        result.failed.push(target.id)
      }
    }
    return result
  })
}
