import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkableUrl, checkLink, collectLinkTargets, scanLinks, type CheckedLink, type LinkTarget } from '@/lib/link-checker'

const response = (status: number) => new Response(null, { status })
const target = (id: string, url = `https://${id}.test/`): LinkTarget => ({ id, url, title: id, folder: '书签栏' })

afterEach(() => vi.useRealTimers())

describe('链接检测', () => {
  it.each([
    [200, 'ok'], [404, 'http-error'], [503, 'http-error'],
    [401, 'restricted'], [403, 'restricted'], [407, 'restricted'], [429, 'restricted'],
  ] as const)('HTTP %s 分类为 %s', async (status, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(status))
    expect(await checkLink('https://a.test', 10_000, new AbortController().signal, request))
      .toEqual({ status: expected, httpStatus: status })
  })

  it('HEAD 不受支持时回退 GET，且不发送 Cookie/Referer、不读取完整正文', async () => {
    const cancelBody = vi.fn()
    const body = new ReadableStream({ cancel: cancelBody })
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(new Response(body, { status: 200 }))

    expect((await checkLink('https://a.test/#section', 10_000, new AbortController().signal, request)).status).toBe('ok')
    expect(request).toHaveBeenNthCalledWith(1, 'https://a.test/', expect.objectContaining({ method: 'HEAD', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' }))
    expect(request).toHaveBeenNthCalledWith(2, 'https://a.test/', expect.objectContaining({ method: 'GET', credentials: 'omit', headers: { Range: 'bytes=0-0' } }))
    expect(cancelBody).toHaveBeenCalledOnce()
  })

  it('HEAD 与 GET 共用超时预算，超时即中止请求', async () => {
    vi.useFakeTimers()
    const request = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(response(405)), 6000)))
      .mockImplementationOnce(() => new Promise(() => {}))
    const pending = checkLink('https://slow.test', 10_000, new AbortController().signal, request)

    await vi.advanceTimersByTimeAsync(6000)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await pending).toEqual({ status: 'timeout' })
    expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('DNS/TLS 等请求异常列为网络失败', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await checkLink('https://offline.test', 1000, new AbortController().signal, request))
      .toEqual({ status: 'network-error' })
  })

  it('跳过非网页地址和内嵌凭据，保留文件夹路径', async () => {
    const request = vi.fn<typeof fetch>()
    for (const url of ['javascript:alert(1)', 'file:///test', 'chrome://settings', 'https://user:pass@a.test/', 'not a url']) {
      expect(checkableUrl(url)).toBeNull()
      expect((await checkLink(url, 1000, new AbortController().signal, request)).status).toBe('unsupported')
    }
    expect(request).not.toHaveBeenCalled()
    expect(collectLinkTargets([{ id: '0', title: '', children: [{ id: '1', title: '收藏', children: [{ id: '10', title: '开发', children: [{ id: '100', title: 'A', url: 'https://a.test' }] }] }] }]))
      .toEqual([{ id: '100', title: 'A', url: 'https://a.test', folder: '收藏 / 开发' }])
  })

  it('最多并发四个网址，忽略片段去重后为每个书签保留结果', async () => {
    let active = 0
    let peak = 0
    const finish: Array<() => void> = []
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => {
      active++
      peak = Math.max(peak, active)
      finish.push(() => { active--; resolve(response(200)) })
    }))
    const results: CheckedLink[] = []
    const targets = [target('a1', 'https://a.test/#one'), target('a2', 'https://a.test/#two'), ...['b', 'c', 'd', 'e', 'f'].map((id) => target(id))]
    const pending = scanLinks(targets, 10, new AbortController().signal, (batch) => results.push(...batch), request)
    expect(request).toHaveBeenCalledTimes(4)
    finish[0]!()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(5))
    finish.slice(1, 5).forEach((resolve) => resolve())
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(6))
    finish[5]!()
    await pending
    expect(peak).toBe(4)
    expect(results).toHaveLength(7)
    expect(new Set(results.map((result) => result.id)).size).toBe(7)
  })

  it('停止扫描会中止在途请求，不启动排队项或记录取消为失效', async () => {
    const controller = new AbortController()
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    const onResults = vi.fn()
    const pending = scanLinks(['a', 'b', 'c', 'd', 'e'].map((id) => target(id)), 10, controller.signal, onResults, request)
    controller.abort()
    await pending
    expect(request).toHaveBeenCalledTimes(4)
    expect(request.mock.calls.every((call) => call[1]?.signal?.aborted)).toBe(true)
    expect(onResults).not.toHaveBeenCalled()
  })
})
