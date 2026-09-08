import type { BookmarkNode } from './types'

export const DEFAULT_LINK_TIMEOUT = 10

export type LinkStatus = 'ok' | 'http-error' | 'timeout' | 'network-error' | 'restricted' | 'unsupported' | 'cancelled'
export interface LinkTarget {
  id: string
  title: string
  url: string
  folder: string
}
export interface LinkProbe {
  status: LinkStatus
  httpStatus?: number
}
export type CheckedLink = LinkTarget & LinkProbe

export function normalizeLinkTimeout(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(60, Math.max(3, Math.round(value)))
    : DEFAULT_LINK_TIMEOUT
}

/** 仅检测网页链接；不发送 URL 内嵌的用户名或密码。 */
export function checkableUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

export function collectLinkTargets(nodes: BookmarkNode[], path: string[] = []): LinkTarget[] {
  return nodes.flatMap((node) => node.url !== undefined
    ? [{ id: node.id, title: node.title, url: node.url, folder: path.join(' / ') }]
    : collectLinkTargets(node.children ?? [], node.title ? [...path, node.title] : path))
}

export function isUnreachable(status: LinkStatus): boolean {
  return status === 'http-error' || status === 'timeout' || status === 'network-error'
}

/** 超时涵盖 HEAD 与必要的 GET 回退；收到响应头后即停止读取正文。 */
export async function checkLink(
  raw: string,
  timeoutMs: number,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<LinkProbe> {
  if (signal.aborted) return { status: 'cancelled' }
  const url = checkableUrl(raw)
  if (!url) return { status: 'unsupported' }

  const controller = new AbortController()
  let abortStatus: 'timeout' | 'cancelled' = 'cancelled'
  let interrupt: (result: LinkProbe) => void = () => {}
  const interrupted = new Promise<LinkProbe>((resolve) => { interrupt = resolve })
  const cancel = () => {
    controller.abort()
    interrupt({ status: abortStatus })
  }
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    abortStatus = 'timeout'
    cancel()
  }, timeoutMs)

  const probe = async (): Promise<LinkProbe> => {
    try {
      const options: RequestInit = {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'follow',
      }
      let response = await request(url, { ...options, method: 'HEAD' })
      void response.body?.cancel().catch(() => {})
      if (response.status === 405 || response.status === 501) {
        if (controller.signal.aborted) return { status: abortStatus }
        response = await request(url, { ...options, method: 'GET', headers: { Range: 'bytes=0-0' } })
        void response.body?.cancel().catch(() => {})
      }
      if (controller.signal.aborted) return { status: abortStatus }
      if ([401, 403, 407, 429].includes(response.status)) return { status: 'restricted', httpStatus: response.status }
      if (response.status >= 200 && response.status < 400) return { status: 'ok', httpStatus: response.status }
      if (response.status >= 400) return { status: 'http-error', httpStatus: response.status }
      return { status: 'network-error' }
    } catch {
      return { status: controller.signal.aborted ? abortStatus : 'network-error' }
    }
  }

  try {
    return await Promise.race([probe(), interrupted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    controller.abort()
  }
}

/** 同网址（忽略片段）复用一次检测，最多 4 个请求同时进行。 */
export async function scanLinks(
  targets: LinkTarget[],
  timeoutSeconds: number,
  signal: AbortSignal,
  onResults: (results: CheckedLink[]) => void,
  request: typeof fetch = fetch,
): Promise<void> {
  const grouped = new Map<string, LinkTarget[]>()
  for (const target of targets) {
    const key = checkableUrl(target.url) ?? target.url
    const group = grouped.get(key) ?? []
    group.push(target)
    grouped.set(key, group)
  }
  const groups = [...grouped.values()]
  let next = 0
  async function worker() {
    while (!signal.aborted) {
      const group = groups[next++]
      if (!group) return
      const result = await checkLink(group[0]!.url, normalizeLinkTimeout(timeoutSeconds) * 1000, signal, request)
      if (signal.aborted || result.status === 'cancelled') return
      onResults(group.map((target) => ({ ...target, ...result })))
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker))
}
