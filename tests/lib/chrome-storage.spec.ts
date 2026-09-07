import { describe, expect, it, vi } from 'vitest'

import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'

describe('chrome-storage', () => {
  it('无存储值时返回兜底默认值', async () => {
    expect(await storageGet('missing-key', 'fallback')).toBe('fallback')
  })

  it('返回已存储的值', async () => {
    await storageSet('theme', 'dark')
    expect(await storageGet('theme', 'light')).toBe('dark')
  })

  it('支持对象值', async () => {
    await storageSet('layout', { width: 200, height: 48 })
    expect(await storageGet('layout', null)).toEqual({ width: 200, height: 48 })
  })

  it('写入触发 onStorageChanged，携带新值', async () => {
    const spy = vi.fn()
    const off = onStorageChanged(spy)
    await storageSet('openInNewTab', false)
    expect(spy).toHaveBeenCalledWith('openInNewTab', false)
    off()
  })

  it('取消订阅后不再收到变更', async () => {
    const spy = vi.fn()
    const off = onStorageChanged(spy)
    off()
    await storageSet('x', 1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('非扩展环境（纯 Web 预览）回退到 localStorage', async () => {
    const saved = globalThis.chrome
    // @ts-expect-error 模拟开发预览环境
    delete globalThis.chrome
    try {
      await storageSet('dev-key', 'dev-value')
      expect(await storageGet('dev-key', 'none')).toBe('dev-value')
    } finally {
      // @ts-expect-error 恢复 mock
      globalThis.chrome = saved
    }
  })

  it('扩展存储的 runtime.lastError 会拒绝 Promise', async () => {
    chrome.runtime.lastError = { message: 'storage unavailable' }
    try {
      await expect(storageGet('broken', 'fallback')).rejects.toThrow('storage unavailable')
      await expect(storageSet('broken', 'value')).rejects.toThrow('storage unavailable')
    } finally {
      chrome.runtime.lastError = null
    }
  })
})
