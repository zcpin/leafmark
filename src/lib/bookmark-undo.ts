import { findNode, getPath } from './tree-utils'
import type { BookmarkNode } from './types'

export interface DeletionTarget {
  id: string
  url?: string
}
export interface DeletionResult {
  deleted: string[]
  skipped: number
  failed: number
}
export interface UndoNode {
  id: string
  title: string
  url?: string
  children?: UndoNode[]
  restoredId?: string
  /** 创建前持久化的意图，用于核对“创建成功但回写中断”的节点。 */
  pendingCreate?: { parentId: string; siblingIds: string[] }
}
export interface UndoEntry {
  parentId: string
  index: number
  node: UndoNode
}
export interface UndoRecord {
  id: string
  entries: UndoEntry[]
  restoredIds?: string[]
  /** 仅 1.x 兼容字段：新版改为多记录栈，不再把上一条内嵌进当前记录。 */
  previous?: UndoEntry[]
  previousRestoredIds?: string[]
}

/** 持久化形态：{ version, records }，records 最新在前 */
export interface UndoStackPayload {
  version: number
  records: UndoRecord[]
}

/** 最近 deletions 记录保留条数；超出后丢弃最旧的一批 */
export const UNDO_STACK_LIMIT = 10
export const UNDO_STACK_VERSION = 2

function snapshot(node: BookmarkNode): UndoNode {
  return {
    id: node.id,
    title: node.title,
    ...(node.url !== undefined
      ? { url: node.url }
      : { children: (node.children ?? []).map(snapshot) }),
  }
}

/** 保存删除前的完整快照；子项与父文件夹同时选中时只保存父项。 */
export function deletionEntries(tree: BookmarkNode[], targets: DeletionTarget[]): UndoEntry[] {
  const valid = new Map(
    targets
      .filter((target) => {
        const node = findNode(tree, target.id)
        return node && node.parentId && node.parentId !== '0' && node.url === target.url
      })
      .map((target) => [target.id, target]),
  )
  return [...valid.values()].flatMap((target) => {
    const node = findNode(tree, target.id)!
    if (
      getPath(tree, node.id)
        .slice(0, -1)
        .some((ancestor) => valid.has(ancestor.id))
    )
      return []
    const siblings = findNode(tree, node.parentId!)?.children ?? []
    return [
      {
        parentId: node.parentId!,
        index: siblings.findIndex((sibling) => sibling.id === node.id),
        node: snapshot(node),
      },
    ]
  })
}

function isUndoRecord(value: unknown): value is UndoRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<UndoRecord>
  return typeof record.id === 'string' && Array.isArray(record.entries)
}

/** 1.x 的单条记录：内嵌的 previous 降级为一条更早的记录，避免升级时丢失。 */
function legacyRecords(record: UndoRecord): UndoRecord[] {
  const current: UndoRecord = { id: record.id, entries: record.entries }
  if (record.restoredIds) current.restoredIds = record.restoredIds
  if (!Array.isArray(record.previous) || !record.previous.length) return [current]
  const previous: UndoRecord = { id: `${record.id}:previous`, entries: record.previous }
  if (record.previousRestoredIds) previous.restoredIds = record.previousRestoredIds
  return [current, previous]
}

/** 丢弃空记录并截断到上限 */
export function pruneUndoStack(records: readonly UndoRecord[]): UndoRecord[] {
  return records.filter((record) => record.entries.length > 0).slice(0, UNDO_STACK_LIMIT)
}

/** 读取持久化值（新版栈 / 1.x 单条 / 空）为记录栈，最新在前。 */
export function parseUndoStack(value: unknown): UndoRecord[] {
  const payload = value as Partial<UndoStackPayload> | null
  const raw = Array.isArray(payload?.records)
    ? payload!.records
    : isUndoRecord(value)
      ? legacyRecords(value)
      : []
  return pruneUndoStack(raw.filter(isUndoRecord))
}
