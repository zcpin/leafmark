import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
    mockMatchMedia(false)
  })

  it('默认值：theme=auto、openInNewTab=true、homeFolderId=null', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(store.theme).toBe('auto')
    expect(store.openInNewTab).toBe(true)
    expect(store.homeFolderId).toBeNull()
  })

  it('init 读取持久化值', async () => {
    chromeMock.__storage.sync.set('theme', 'dark')
    chromeMock.__storage.sync.set('homeFolderId', '2')
    chromeMock.__storage.sync.set('openInNewTab', false)

    const store = useSettingsStore()
    await store.init()
    expect(store.theme).toBe('dark')
    expect(store.homeFolderId).toBe('2')
    expect(store.openInNewTab).toBe(false)
  })

  it('resolvedTheme：auto 模式跟随系统', async () => {
    mockMatchMedia(true)
    const store = useSettingsStore()
    await store.init()
    expect(store.theme).toBe('auto')
    expect(store.resolvedTheme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('resolvedTheme：auto + 浅色系统 → light', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(store.resolvedTheme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('setTheme 持久化并应用到 data-theme', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setTheme('dark')
    expect(chromeMock.__storage.sync.get('theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('setHomeFolderId 持久化', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setHomeFolderId('10')
    expect(chromeMock.__storage.sync.get('homeFolderId')).toBe('10')
  })

  it('setOpenInNewTab 持久化', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setOpenInNewTab(false)
    expect(chromeMock.__storage.sync.get('openInNewTab')).toBe(false)
  })

  it('cycleTheme 在 light → dark → auto 间循环', async () => {
    const store = useSettingsStore()
    await store.init()
    store.theme = 'light'
    store.cycleTheme()
    expect(store.theme).toBe('dark')
    store.cycleTheme()
    expect(store.theme).toBe('auto')
    store.cycleTheme()
    expect(store.theme).toBe('light')
  })
})
