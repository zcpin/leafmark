import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestLinkCheckAccess } from '@/lib/link-check-permissions'
import { chromeMock } from '../mocks/chrome'

afterEach(() => vi.unstubAllGlobals())

describe('链接检测可选权限', () => {
  it('在点击调用栈内立即申请权限，不先等待异步查询', async () => {
    let grant: ((allowed: boolean) => void) | undefined
    const request = vi.fn((_permissions, callback: (allowed: boolean) => void) => { grant = callback })
    vi.stubGlobal('chrome', { ...chromeMock, permissions: { request } })
    const pending = requestLinkCheckAccess()
    expect(request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] }, expect.any(Function))
    grant?.(true)
    expect(await pending).toBe(true)
  })

  it('保留拒绝授权和 Chrome 错误语义', async () => {
    const request = vi.fn((_permissions, callback: (allowed: boolean) => void) => callback(false))
    vi.stubGlobal('chrome', { ...chromeMock, permissions: { request } })
    expect(await requestLinkCheckAccess()).toBe(false)
    request.mockImplementationOnce((_permissions, callback) => {
      chromeMock.runtime.lastError = { message: 'permission unavailable' }
      callback(false)
      chromeMock.runtime.lastError = null
    })
    await expect(requestLinkCheckAccess()).rejects.toThrow('permission unavailable')
  })
})
