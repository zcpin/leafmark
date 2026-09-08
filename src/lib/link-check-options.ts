import { collectLinkTargets } from './link-checker'
import { findNode, getPath, isFolder } from './tree-utils'
import type { BookmarkNode } from './types'

export interface LinkCheckOptions { folderId: string | null; ignoredDomains: string[] }

export function normalizeIgnoredDomain(raw: string): string | null {
  try {
    const value = raw.trim().replace(/^\*\./, '')
    if (!value || /\s/.test(value)) return null
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '')
    if (!host || host.includes('..') || !(/^[a-z0-9_.-]+$/.test(host) || /^\[[a-f0-9:]+\]$/.test(host))) return null
    return host
  } catch { return null }
}

export function normalizeLinkCheckOptions(value: unknown): LinkCheckOptions {
  const source = value && typeof value === 'object' ? value as Partial<LinkCheckOptions> : {}
  const domains = Array.isArray(source.ignoredDomains) ? source.ignoredDomains : []
  return {
    folderId: typeof source.folderId === 'string' && source.folderId && source.folderId !== '0' ? source.folderId : null,
    ignoredDomains: [...new Set(domains.flatMap((domain) => {
      const normalized = typeof domain === 'string' ? normalizeIgnoredDomain(domain) : null
      return normalized ? [normalized] : []
    }))],
  }
}

export function isIgnoredUrl(url: string, domains: string[]): boolean {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '')
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  } catch { return false }
}

export function scopedCheckTargets(tree: BookmarkNode[], options: LinkCheckOptions) {
  const folder = options.folderId ? findNode(tree, options.folderId) : undefined
  const valid = !options.folderId || !!(folder && isFolder(folder))
  const scope = !options.folderId ? collectLinkTargets(tree) : folder && isFolder(folder)
    ? collectLinkTargets([folder], getPath(tree, folder.id).slice(0, -1).map((node) => node.title).filter(Boolean)) : []
  const targets = scope.filter((target) => !isIgnoredUrl(target.url, options.ignoredDomains))
  return { valid, targets, ignored: scope.length - targets.length }
}

export function checkFolderOptions(tree: BookmarkNode[], path: string[] = []): { id: string; label: string }[] {
  return tree.flatMap((node) => {
    if (!isFolder(node)) return []
    const nextPath = node.id === '0' ? path : [...path, node.title || `#${node.id}`]
    return [...(node.id === '0' ? [] : [{ id: node.id, label: nextPath.join(' / ') }]), ...checkFolderOptions(node.children ?? [], nextPath)]
  })
}
