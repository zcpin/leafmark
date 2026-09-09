import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

describe('settings store（Phase 3：布局 / 壁纸）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it.each(['2', null])('主页保存失败时保留原设置（目标 %s）', async (target) => {
    const store = useSettingsStore()
    await store.init()
    await store.setHomeFolderId('10')
    chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'storage unavailable' }
      callback()
      chromeMock.runtime.lastError = null
    })

    await expect(store.setHomeFolderId(target)).rejects.toThrow('storage unavailable')
    expect(store.homeFolderId).toBe('10')
    expect(chromeMock.__storage.sync.get('homeFolderId')).toBe('10')
    store.dispose()
  })

  it('主页保存获得成功确认后才更新当前选择', async () => {
    const store = useSettingsStore()
    await store.setHomeFolderId('10')
    let confirmSave: (() => void) | undefined
    chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
      confirmSave = callback
    })

    const pending = store.setHomeFolderId('2')
    expect(store.homeFolderId).toBe('10')
    confirmSave?.()
    await pending
    expect(store.homeFolderId).toBe('2')
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

  it('没有旧配置时使用更实的默认面板透明度', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(store.glassTransparency).toBe(15)
    expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('0.85')
    expect(document.documentElement.style.getPropertyValue('--lm-glass-strong-opacity')).toBe('0.95')
    store.dispose()
  })

  it('显示开关默认全开、独立保存并在新页面恢复', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(store.display).toEqual({ clock: true, yearProgress: true, stats: true })
    await store.setDisplay({ clock: false, stats: false })
    expect(chromeMock.__storage.sync.get('display')).toEqual({ clock: false, yearProgress: true, stats: false })
    store.dispose()
    setActivePinia(createPinia())
    const reopened = useSettingsStore()
    await reopened.init()
    expect(reopened.display).toEqual({ clock: false, yearProgress: true, stats: false })
    reopened.dispose()
  })

  it('检测目录与忽略名单保存在本机，重新打开后恢复', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setLinkCheckOptions({ folderId: '10', ignoredDomains: ['*.Example.com', 'https://login.test/path'] })
    expect(chromeMock.__storage.local.get('linkCheckOptions')).toEqual({ folderId: '10', ignoredDomains: ['example.com', 'login.test'] })
    store.dispose()
    setActivePinia(createPinia())
    const reopened = useSettingsStore()
    await reopened.init()
    expect(reopened.linkCheckOptions.folderId).toBe('10')
    expect(reopened.linkCheckOptions.ignoredDomains).toEqual(['example.com', 'login.test'])
    reopened.dispose()
  })

  it('链接检测超时限制在允许范围，并在重新打开后恢复', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(store.linkCheckTimeout).toBe(10)
    await store.setLinkCheckTimeout(1)
    expect(store.linkCheckTimeout).toBe(3)
    await store.setLinkCheckTimeout(120)
    expect(chromeMock.__storage.sync.get('linkCheckTimeout')).toBe(60)
    store.dispose()
    setActivePinia(createPinia())
    const reopened = useSettingsStore()
    await reopened.init()
    expect(reopened.linkCheckTimeout).toBe(60)
    reopened.dispose()
  })

  it('透明度修改更新视觉并持久化，重新打开后恢复', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setGlassTransparency(40)
    expect(chromeMock.__storage.sync.get('glassTransparency')).toBe(40)
    expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('0.6')
    expect(document.documentElement.style.getPropertyValue('--lm-glass-strong-opacity')).toBe('0.7')
    store.dispose()

    setActivePinia(createPinia())
    const reopened = useSettingsStore()
    await reopened.init()
    expect(reopened.glassTransparency).toBe(40)
    expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('0.6')
    reopened.dispose()
  })

  it('同步其他页面的透明度变化，移除配置后恢复默认值', async () => {
    const store = useSettingsStore()
    await store.init()
    chromeMock.storage.sync.set({ glassTransparency: 0 }, () => {})
    await vi.waitFor(() => {
      expect(store.glassTransparency).toBe(0)
      expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('1')
      expect(document.documentElement.style.getPropertyValue('--lm-glass-strong-opacity')).toBe('1')
    })

    chromeMock.storage.onChanged.__emit({ glassTransparency: { oldValue: 0 } }, 'sync')
    await vi.waitFor(() => {
      expect(store.glassTransparency).toBe(15)
      expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('0.85')
    })
    store.dispose()
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

  it('切换纯色背景时清理旧壁纸数据', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setUserWallpaper('data:image/jpeg,old-wallpaper')

    await store.setSolidBg('gradient-sky')

    expect(store.wallpaperDataUrl).toBeNull()
    expect(chromeMock.__storage.local.get('wallpaperDataUrl')).toBeNull()
  })

  it('init 读取持久化的布局', async () => {
    chromeMock.__storage.sync.set('layout', { cardWidth: 180, cardHeight: 50, containerWidth: 90 })
    const store = useSettingsStore()
    await store.init()
    expect(store.layout.cardWidth).toBe(180)
    expect(store.layout.containerWidth).toBe(90)
  })

  it('init 将已持久化的视觉降级设置应用到根节点', async () => {
    chromeMock.__storage.sync.set('reduceEffects', true)
    const store = useSettingsStore()

    await store.init()

    expect(document.documentElement.classList.contains('reduce-effects')).toBe(true)
    store.dispose()
    document.documentElement.classList.remove('reduce-effects')
  })

  it('并发/重复 init 只注册一组监听，dispose 可清理', async () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue(media as unknown as MediaQueryList)
    const store = useSettingsStore()

    await Promise.all([store.init(), store.init(), store.init()])

    expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(2)
    expect(media.addEventListener).toHaveBeenCalledTimes(1)

    store.dispose()

    expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledTimes(2)
    expect(media.removeEventListener).toHaveBeenCalledTimes(1)
    matchMedia.mockRestore()
  })

  it('初始化按区域批量读取，每区只请求一次', async () => {
    const store = useSettingsStore()
    await store.init()
    expect(chromeMock.storage.sync.get).toHaveBeenCalledTimes(1)
    expect(chromeMock.storage.local.get).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('连续拖动即时预览，将布局和透明度合并成一次写入', async () => {
    vi.useFakeTimers()
    const store = useSettingsStore()
    try {
      await store.init()
      const first = store.setLayout({ cardWidth: 220 })
      const second = store.setLayout({ cardWidth: 250, cardHeight: 60 })
      const third = store.setGlassTransparency(40)
      expect(store.layout.cardWidth).toBe(250)
      expect(store.glassTransparency).toBe(40)
      expect(chromeMock.storage.sync.set).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      await Promise.all([first, second, third])
      expect(chromeMock.storage.sync.set).toHaveBeenCalledTimes(1)
      expect(chromeMock.__storage.sync.get('layout')).toEqual({ cardWidth: 250, cardHeight: 60, containerWidth: 85 })
      expect(chromeMock.__storage.sync.get('glassTransparency')).toBe(40)
    } finally { store.dispose(); vi.useRealTimers() }
  })

  it('布局保存失败恢复已持久化的预览', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setLayout({ cardWidth: 220 })
    chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'quota exceeded' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await expect(store.setLayout({ cardWidth: 260 })).rejects.toThrow('quota exceeded')
    expect(store.layout.cardWidth).toBe(220)
    expect(chromeMock.__storage.sync.get('layout')).toMatchObject({ cardWidth: 220 })
    store.dispose()
  })

  it('普通设置保存失败保留原值', async () => {
    const store = useSettingsStore()
    await store.init()
    chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'storage unavailable' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await expect(store.setTheme('dark')).rejects.toThrow('storage unavailable')
    expect(store.theme).toBe('auto')
    store.dispose()
  })

  it('上传壁纸存储失败时保留原背景和图片', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setPresetWallpaper('preset-1', 'data:image/svg+xml,old')
    chromeMock.storage.local.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'quota exceeded' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await expect(store.setUserWallpaper('data:image/jpeg,new')).rejects.toThrow('quota exceeded')
    expect(store.wallpaperId).toBe('preset-1')
    expect(store.wallpaperDataUrl).toBe('data:image/svg+xml,old')
    expect(chromeMock.__storage.sync.get('wallpaperId')).toBe('preset-1')
    store.dispose()
  })

  it('旧滑块写入完成时保留最新预览，后续按顺序保存', async () => {
    const store = useSettingsStore()
    await store.init()
    const write = chromeMock.storage.sync.set.getMockImplementation()!
    let complete!: () => void
    chromeMock.storage.sync.set.mockImplementationOnce((items, callback) => { complete = () => write(items, callback) })
    const first = store.setLayout({ cardWidth: 220 })
    const flushing = store.flushAppearance()
    const second = store.setLayout({ cardWidth: 260 })
    complete()
    await Promise.all([first, flushing])
    expect(store.layout.cardWidth).toBe(260)
    await store.flushAppearance()
    await second
    expect(chromeMock.__storage.sync.get('layout')).toMatchObject({ cardWidth: 260 })
    store.dispose()
  })

  it('离开页面立即提交尚未到防抖时间的布局', async () => {
    const store = useSettingsStore()
    await store.init()
    const pending = store.setLayout({ containerWidth: 75 })
    window.dispatchEvent(new Event('pagehide'))
    await pending
    expect(chromeMock.__storage.sync.get('layout')).toMatchObject({ containerWidth: 75 })
    store.dispose()
  })

  it('连续切换不同显示开关不会被较早的保存覆盖', async () => {
    const store = useSettingsStore()
    await store.init()
    const write = chromeMock.storage.sync.set.getMockImplementation()!
    let complete!: () => void
    chromeMock.storage.sync.set.mockImplementationOnce((items, callback) => { complete = () => write(items, callback) })
    const clock = store.setDisplay({ clock: false })
    const stats = store.setDisplay({ stats: false })
    complete()
    await Promise.all([clock, stats])
    expect(store.display).toEqual({ clock: false, yearProgress: true, stats: false })
    store.dispose()
  })

  it('背景元数据保存失败时恢复旧图片', async () => {
    const store = useSettingsStore()
    await store.init()
    await store.setUserWallpaper('data:image/jpeg,old')
    const previousId = store.wallpaperId
    chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'sync unavailable' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await expect(store.setPresetWallpaper('preset-1', 'data:image/svg+xml,new')).rejects.toThrow('sync unavailable')
    expect(store.wallpaperId).toBe(previousId)
    expect(store.wallpaperDataUrl).toBe('data:image/jpeg,old')
    expect(chromeMock.__storage.local.get('wallpaperDataUrl')).toBe('data:image/jpeg,old')
    store.dispose()
  })

  it('初始化读取失败可以重试，不留下半套监听', async () => {
    const store = useSettingsStore()
    chromeMock.storage.sync.get.mockImplementationOnce((_keys, callback) => {
      chromeMock.runtime.lastError = { message: 'read failed' }
      callback({})
      chromeMock.runtime.lastError = null
    })
    await expect(store.init()).rejects.toThrow('read failed')
    expect(store.loadError).toBe(true)
    expect(store.ready).toBe(false)
    expect(chromeMock.storage.onChanged.addListener).not.toHaveBeenCalled()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.loadError).toBe(false)
    expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(2)
    store.dispose()
  })
})
