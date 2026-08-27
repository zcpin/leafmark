import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

describe('settings store（Phase 3：布局 / 壁纸）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('setLayout 持久化布局并更新 CSS 变量', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setLayout({ cardWidth: 220, cardHeight: 56 })
    expect(store.layout.cardWidth).toBe(220)
    expect(chromeMock.__storage.sync.get('layout')).toEqual({
      cardWidth: 220,
      cardHeight: 56,
      containerWidth: 85,
    })
    expect(document.documentElement.style.getPropertyValue('--lm-card-width')).toBe('220px')
    expect(document.documentElement.style.getPropertyValue('--lm-card-height')).toBe('56px')
  })

  it('setSolidBg 切换为纯色模式，清空壁纸 id', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setPresetWallpaper('preset-1', 'data:image/svg+xml,x')
    await store.setSolidBg('gradient-sky')
    expect(store.bgKind).toBe('solid')
    expect(store.solidBg).toBe('gradient-sky')
    expect(store.wallpaperId).toBeNull()
    expect(document.documentElement.dataset.bg).toBe('gradient-sky')
  })

  it('setPresetWallpaper 切换为壁纸模式，data-bg=wallpaper', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setPresetWallpaper('preset-2', 'data:image/svg+xml,y')
    expect(store.bgKind).toBe('wallpaper')
    expect(store.wallpaperId).toBe('preset-2')
    expect(chromeMock.__storage.local.get('wallpaperDataUrl')).toBe('data:image/svg+xml,y')
    expect(document.documentElement.dataset.bg).toBe('wallpaper')
  })

  it('setUserWallpaper 把 dataURL 存入 storage.local', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setUserWallpaper('data:image/jpeg,zzz')
    expect(store.bgKind).toBe('wallpaper')
    expect(store.wallpaperId).toMatch(/^user:\d+$/)
    expect(chromeMock.__storage.local.get('wallpaperDataUrl')).toBe('data:image/jpeg,zzz')
  })

  it('init 读取持久化的布局', async () => {
    chromeMock.__storage.sync.set('layout', { cardWidth: 180, cardHeight: 50, containerWidth: 90 })
    const store = useSettingsStore()
    await store.init()
    expect(store.layout.cardWidth).toBe(180)
    expect(store.layout.containerWidth).toBe(90)
  })
})
