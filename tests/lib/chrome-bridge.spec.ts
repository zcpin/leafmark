import { describe, expect, it } from 'vitest'

import { callChrome } from '@/lib/chrome-bridge'
import { chromeMock } from '../mocks/chrome'

describe('chrome-bridge', () => {
  it('把回调结果转换为 Promise', async () => {
    await expect(callChrome<number>((cb) => cb(42))).resolves.toBe(42)
  })

  it('把 runtime.lastError 转换为拒绝', async () => {
    chromeMock.runtime.lastError = { message: 'permission denied' }
    try {
      await expect(callChrome<void>((cb) => cb())).rejects.toThrow('permission denied')
    } finally {
      chromeMock.runtime.lastError = null
    }
  })

  it('捕获平台调用同步抛出的错误', async () => {
    await expect(
      callChrome<void>(() => {
        throw new Error('native throw')
      }),
    ).rejects.toThrow('native throw')
  })
})
