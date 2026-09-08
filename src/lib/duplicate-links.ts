import { collectLinkTargets, type LinkTarget } from './link-checker'
import type { BookmarkNode } from './types'

export interface DuplicateGroup { url: string; links: LinkTarget[] }

/** 精确匹配完整 URL，保留参数和片段的差异。 */
export function findDuplicateLinks(tree: BookmarkNode[]): DuplicateGroup[] {
  const groups = new Map<string, LinkTarget[]>()
  for (const target of collectLinkTargets(tree)) {
    const group = groups.get(target.url) ?? []
    group.push(target)
    groups.set(target.url, group)
  }
  return [...groups].filter(([, links]) => links.length > 1).map(([url, links]) => ({ url, links }))
}

export function retainsDuplicateCopy(tree: BookmarkNode[], selected: LinkTarget[]): boolean {
  const current = collectLinkTargets(tree)
  const chosen = new Map(selected.map((link) => [link.id, link.url]))
  const counts = new Map<string, { total: number; removed: number }>()
  for (const link of current) {
    const count = counts.get(link.url) ?? { total: 0, removed: 0 }
    count.total++
    if (chosen.get(link.id) === link.url) count.removed++
    counts.set(link.url, count)
  }
  return [...counts.values()].every((count) => count.removed < count.total)
}
