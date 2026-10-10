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
  /** 删除时间（毫秒）；旧记录没有该字段时回退到批次时间。 */
  deletedAt?: number
  /** 删除时所在目录名；目录本身被删除后仍能展示来源。 */
  parentTitle?: string
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

/** 回收站保留的批次数与条目数上限；超出后从最旧的开始丢弃 */
export const UNDO_STACK_LIMIT = 30
export const UNDO_ITEM_LIMIT = 150
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
export function deletionEntries(
  tree: BookmarkNode[],
  targets: DeletionTarget[],
  deletedAt = Date.now(),
): UndoEntry[] {
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
        deletedAt,
        ...(findNode(tree, node.parentId!)?.title
          ? { parentTitle: findNode(tree, node.parentId!)!.title }
          : {}),
      },
    ]
  })
}

/** 子树内的书签数量（文件夹条目展示用） */
export function countBookmarks(node: UndoNode): number {
  if (node.url !== undefined) return 1
  return (node.children ?? []).reduce((sum, child) => sum + countBookmarks(child), 0)
}

/** 批次时间：id 形如 `${Date.now()}-…`，旧数据解析不出时按 0 处理。 */
export function recordTime(record: UndoRecord): number {
  const parsed = Number.parseInt(record.id, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 回收站条目：展平后的删除项，最新在前，带所属批次与确定的删除时间。 */
export interface BinEntry extends UndoEntry {
  recordId: string
  deletedAt: number
}

export function binEntries(records: readonly UndoRecord[]): BinEntry[] {
  return records
    .flatMap((record) => {
      const fallback = recordTime(record)
      return record.entries.map((entry) => ({
        ...entry,
        recordId: record.id,
        deletedAt:
          typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt)
            ? entry.deletedAt
            : fallback,
      }))
    })
    .sort((a, b) => b.deletedAt - a.deletedAt)
}

/** 按节点 id 移除条目；整批都被移除时丢掉该批（其中的恢复进度随之失效）。 */
export function dropEntries(
  records: readonly UndoRecord[],
  ids: ReadonlySet<string>,
): UndoRecord[] {
  return records.flatMap((record) => {
    if (!record.entries.some((entry) => ids.has(entry.node.id))) return [record]
    const entries = record.entries.filter((entry) => !ids.has(entry.node.id))
    return entries.length ? [{ ...record, entries }] : []
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

/** 丢弃空记录，并按批次数与条目数双重上限截断（都从最旧的开始丢）。 */
export function pruneUndoStack(records: readonly UndoRecord[]): UndoRecord[] {
  let kept = records.filter((record) => record.entries.length > 0).slice(0, UNDO_STACK_LIMIT)
  const total = kept.reduce((sum, record) => sum + record.entries.length, 0)
  if (total <= UNDO_ITEM_LIMIT) return kept
  let budget = UNDO_ITEM_LIMIT
  kept = kept.flatMap((record) => {
    if (budget <= 0) return []
    const entries = record.entries.slice(0, budget)
    budget -= entries.length
    return entries.length === record.entries.length ? [record] : [{ ...record, entries }]
  })
  return kept
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
