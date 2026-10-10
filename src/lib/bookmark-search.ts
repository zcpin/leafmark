// 书签搜索：归一化、分词、打分、截断（纯函数，无 chrome 依赖，测试重点）
// 只做本地书签过滤：不接外部搜索引擎、不搜历史记录。
import type { BookmarkNode } from './types'

/** 结果展示上限；超出部分只提示数量，避免大库下挂载过多卡片 */
export const MAX_SEARCH_RESULTS = 200

export interface SearchHit {
  node: BookmarkNode
  score: number
  /** 所在文件夹的标题链（不含自身），结果卡片用它做副标题 */
  path: string[]
}

const SCORE = {
  /** 标题以某个词元开头 */
  titleWordStart: 60,
  /** 标题包含词元（书签） */
  titleContains: 40,
  /** 标题包含词元（文件夹，比书签低一档，让书签优先） */
  folderTitleContains: 30,
  /** URL 主机名以词元开头 */
  hostStartsWith: 25,
  /** URL 包含词元 */
  urlContains: 20,
  /** 标题以完整查询开头时的一次性加权：60 + 40 = 100 */
  fullQueryBonus: 40,
}

/** 标题归一化：去首尾空白、折叠连续空白、转小写 */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** URL 归一化：去掉协议与末尾斜杠后转小写，避免 scheme 干扰匹配 */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** 按空白切词；空查询返回空数组 */
export function tokenize(query: string): string[] {
  return normalizeText(query).split(' ').filter(Boolean)
}

function hostOf(normalizedUrl: string): string {
  return normalizedUrl.split('/')[0].replace(/^www\./, '')
}

/**
 * 单个节点的得分：0 表示未命中。
 * 每个词元只取其命中的最高一档，多个词元累加；标题以完整查询开头再加权一次。
 */
export function scoreNode(node: BookmarkNode, tokens: readonly string[], query: string): number {
  if (tokens.length === 0) return 0
  const title = normalizeText(node.title)
  const isDir = node.url === undefined
  const url = node.url ? normalizeUrl(node.url) : ''
  const host = url ? hostOf(url) : ''

  let score = 0
  for (const token of tokens) {
    let best = 0
    if (title.startsWith(token)) best = SCORE.titleWordStart
    else if (title.includes(token)) best = isDir ? SCORE.folderTitleContains : SCORE.titleContains
    if (!isDir && url) {
      if (host.startsWith(token)) best = Math.max(best, SCORE.hostStartsWith)
      else if (url.includes(token)) best = Math.max(best, SCORE.urlContains)
    }
    // 任一词元未命中即整体不命中（AND）
    if (best === 0) return 0
    score += best
  }
  if (title.startsWith(query)) score += SCORE.fullQueryBonus
  return score
}

/**
 * 在给定子树内搜索。返回按得分降序的结果；同分按树的深度优先序（Array.sort 稳定）。
 * 调用方负责按 MAX_SEARCH_RESULTS 截断，本函数返回全部命中以便统计总数。
 */
export function searchBookmarks(nodes: readonly BookmarkNode[], rawQuery: string): SearchHit[] {
  const tokens = tokenize(rawQuery)
  const query = normalizeText(rawQuery)
  if (tokens.length === 0) return []

  const hits: SearchHit[] = []
  const walk = (list: readonly BookmarkNode[], path: string[]) => {
    for (const node of list) {
      const score = scoreNode(node, tokens, query)
      if (score > 0) hits.push({ node, score, path })
      if (!node.children) continue
      // 虚拟根（id=0）不算一层目录，不进路径
      walk(node.children, node.id === '0' ? path : [...path, node.title])
    }
  }
  walk(nodes, [])
  return hits.sort((a, b) => b.score - a.score)
}
