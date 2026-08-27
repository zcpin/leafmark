import { beforeEach, vi } from 'vitest'

import { chromeMock } from './mocks/chrome'

// 安装 chrome mock（lib 层通过 isExtensionEnv() 检测 chrome.runtime.id）
// @ts-expect-error 测试桩不实现完整 chrome 类型
globalThis.chrome = chromeMock

// matchMedia 桩（happy-dom 可能缺失 prefers-color-scheme 支持）
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

beforeEach(() => {
  chromeMock.__reset()
})
