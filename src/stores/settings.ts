// 用户设置：主题(F1) / 主页文件夹(A2) / 打开方式(G5) / 布局(F6) / 壁纸(F2/F3/F5)
// 主题/布局等小数据存 storage.sync；壁纸图片数据存 storage.local（配额大）
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'

export type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = Exclude<ThemeMode, 'auto'>

/** 背景类型：纯色/渐变(F5) 或 壁纸(F2/F3) */
export type BackgroundKind = 'solid' | 'wallpaper'

export interface LayoutSettings {
  /** 卡片宽度（px），F6 */
  cardWidth: number
  /** 卡片高度（px），F6 */
  cardHeight: number
  /** 主区容器宽度占比（%），F6 */
  containerWidth: number
}

export interface LayoutPreset {
  cardWidth: number
  cardHeight: number
  containerWidth: number
}

const DEFAULT_LAYOUT: LayoutSettings = {
  cardWidth: 200,
  cardHeight: 48,
  containerWidth: 85,
}

const THEME_QUERY = '(prefers-color-scheme: dark)'
const DEFAULT_GLASS_TRANSPARENCY = 15

function normalizeTransparency(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(60, Math.max(0, value))
    : DEFAULT_GLASS_TRANSPARENCY
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const homeFolderId = ref<string | null>(null)
  const openInNewTab = ref(true)
  const systemDark = ref(false)

  // —— 布局 F6 ——
  const layout = ref<LayoutSettings>({ ...DEFAULT_LAYOUT })

  // —— 性能：关闭毛玻璃模糊（低性能设备降级，仅保留半透明底）——
  const reduceEffects = ref(false)
  /** 面板透明度（0~60%）；0 表示完全不透明。 */
  const glassTransparency = ref(DEFAULT_GLASS_TRANSPARENCY)

  // —— 背景 F2/F3/F5 ——
  const bgKind = ref<BackgroundKind>('solid')
  /** 纯色/渐变背景的 CSS 类名（F5） */
  const solidBg = ref<string>('gradient-emerald')
  /** 壁纸标识：preset:{id} | user:{timestamp} */
  const wallpaperId = ref<string | null>(null)
  /** 壁纸 dataURL（仅 user 上传时存 storage.local，预设壁纸用打包资源 URL） */
  const wallpaperDataUrl = ref<string | null>(null)

  // 外部监听的生命周期：init 可被多个消费者并发调用，但只挂一组监听
  let initPromise: Promise<void> | null = null
  let initialized = false
  let stopSyncStorage: (() => void) | null = null
  let stopLocalStorage: (() => void) | null = null
  let mediaQuery: MediaQueryList | null = null

  /** auto 时解析为系统实际主题 */
  const resolvedTheme = computed<ResolvedTheme>(() =>
    theme.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : theme.value,
  )

  /** 应用到 <html> 的 CSS 变量，供网格卡片尺寸使用 */
  function applyLayout() {
    const root = document.documentElement
    root.style.setProperty('--lm-card-width', `${layout.value.cardWidth}px`)
    root.style.setProperty('--lm-card-height', `${layout.value.cardHeight}px`)
  }

  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme.value
  }

  function applyReduceEffects() {
    document.documentElement.classList.toggle('reduce-effects', reduceEffects.value)
  }

  function applyGlassTransparency() {
    const root = document.documentElement
    root.style.setProperty('--lm-glass-opacity', String((100 - glassTransparency.value) / 100))
    root.style.setProperty('--lm-glass-strong-opacity', String(Math.min(100, 110 - glassTransparency.value) / 100))
  }

  function applyBackground() {
    const root = document.documentElement
    if (bgKind.value === 'wallpaper' && wallpaperDataUrl.value) {
      root.style.setProperty('--lm-bg-image', `url("${wallpaperDataUrl.value}")`)
      root.dataset.bg = 'wallpaper'
    } else {
      root.style.removeProperty('--lm-bg-image')
      root.dataset.bg = solidBg.value
    }
  }

  function onSystemThemeChange(event: MediaQueryListEvent) {
    systemDark.value = event.matches
  }

  function onSyncStorageChange(key: string, value: unknown) {
    if (key === 'theme') theme.value = value as ThemeMode
    else if (key === 'homeFolderId') homeFolderId.value = value as string | null
    else if (key === 'openInNewTab') openInNewTab.value = value === true
    else if (key === 'reduceEffects') reduceEffects.value = value === true
    else if (key === 'glassTransparency') glassTransparency.value = normalizeTransparency(value)
    else if (key === 'layout')
      layout.value = { ...DEFAULT_LAYOUT, ...(value as Partial<LayoutSettings>) }
    else if (key === 'bgKind') bgKind.value = value as BackgroundKind
    else if (key === 'solidBg') solidBg.value = value as string
    else if (key === 'wallpaperId') wallpaperId.value = value as string | null
  }

  function onLocalStorageChange(key: string, value: unknown) {
    if (key === 'wallpaperDataUrl') wallpaperDataUrl.value = value as string | null
  }

  watch(resolvedTheme, applyTheme)
  watch(layout, applyLayout, { deep: true })
  watch([bgKind, solidBg, wallpaperDataUrl], applyBackground)
  watch(reduceEffects, applyReduceEffects)
  watch(glassTransparency, applyGlassTransparency)

  async function init() {
    if (initialized) return
    if (initPromise) return initPromise

    const pending = (async () => {
      theme.value = await storageGet<ThemeMode>('theme', 'auto')
      homeFolderId.value = await storageGet<string | null>('homeFolderId', null)
      openInNewTab.value = await storageGet('openInNewTab', true)
      reduceEffects.value = await storageGet('reduceEffects', false)
      glassTransparency.value = normalizeTransparency(await storageGet('glassTransparency', DEFAULT_GLASS_TRANSPARENCY))
      layout.value = {
        ...DEFAULT_LAYOUT,
        ...(await storageGet<Partial<LayoutSettings>>('layout', {})),
      }
      bgKind.value = await storageGet<BackgroundKind>('bgKind', 'solid')
      solidBg.value = await storageGet('solidBg', 'gradient-emerald')
      wallpaperId.value = await storageGet<string | null>('wallpaperId', null)
      // 用户上传壁纸的 dataURL 存 storage.local
      wallpaperDataUrl.value = await storageGet<string | null>('wallpaperDataUrl', null, 'local')

      if (!mediaQuery) {
        mediaQuery = window.matchMedia(THEME_QUERY)
        systemDark.value = mediaQuery.matches
        mediaQuery.addEventListener('change', onSystemThemeChange)
      }
      stopSyncStorage ??= onStorageChanged(onSyncStorageChange)
      stopLocalStorage ??= onStorageChanged(onLocalStorageChange, 'local')

      applyTheme()
      applyLayout()
      applyBackground()
      applyReduceEffects()
      applyGlassTransparency()
      initialized = true
    })()

    initPromise = pending
    try {
      await pending
    } finally {
      if (initPromise === pending) initPromise = null
    }
  }

  function dispose() {
    stopSyncStorage?.()
    stopSyncStorage = null
    stopLocalStorage?.()
    stopLocalStorage = null

    if (mediaQuery) {
      mediaQuery.removeEventListener('change', onSystemThemeChange)
      mediaQuery = null
    }
    initialized = false
    initPromise = null
  }

  async function setTheme(mode: ThemeMode) {
    theme.value = mode
    await storageSet('theme', mode)
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'auto']
    const next = order[(order.indexOf(theme.value) + 1) % order.length]!
    void setTheme(next)
  }

  async function setHomeFolderId(id: string | null) {
    await storageSet('homeFolderId', id)
    homeFolderId.value = id
  }

  async function setOpenInNewTab(value: boolean) {
    openInNewTab.value = value
    await storageSet('openInNewTab', value)
  }

  async function setReduceEffects(value: boolean) {
    reduceEffects.value = value
    await storageSet('reduceEffects', value)
  }

  async function setGlassTransparency(value: number) {
    const next = normalizeTransparency(value)
    await storageSet('glassTransparency', next)
    glassTransparency.value = next
  }

  async function setLayout(partial: Partial<LayoutSettings>) {
    layout.value = { ...layout.value, ...partial }
    await storageSet('layout', layout.value)
  }

  async function setSolidBg(cssClass: string) {
    solidBg.value = cssClass
    bgKind.value = 'solid'
    wallpaperId.value = null
    wallpaperDataUrl.value = null
    await storageSet('bgKind', 'solid')
    await storageSet('solidBg', cssClass)
    await storageSet('wallpaperId', null)
    await storageSet('wallpaperDataUrl', null, 'local')
  }

  /** 应用预设壁纸（F2）：仅记录 id，dataURL 用打包资源 URL */
  async function setPresetWallpaper(id: string, url: string) {
    bgKind.value = 'wallpaper'
    wallpaperId.value = id
    wallpaperDataUrl.value = url
    await storageSet('bgKind', 'wallpaper')
    await storageSet('wallpaperId', id)
    await storageSet('wallpaperDataUrl', url, 'local')
  }

  /** 应用用户上传壁纸（F3）：dataURL 存 storage.local */
  async function setUserWallpaper(dataUrl: string) {
    bgKind.value = 'wallpaper'
    const id = `user:${Date.now()}`
    wallpaperId.value = id
    wallpaperDataUrl.value = dataUrl
    await storageSet('bgKind', 'wallpaper')
    await storageSet('wallpaperId', id)
    await storageSet('wallpaperDataUrl', dataUrl, 'local')
  }

  return {
    theme,
    homeFolderId,
    openInNewTab,
    reduceEffects,
    glassTransparency,
    layout,
    bgKind,
    solidBg,
    wallpaperId,
    wallpaperDataUrl,
    resolvedTheme,
    init,
    setTheme,
    dispose,
    cycleTheme,
    setHomeFolderId,
    setOpenInNewTab,
    setReduceEffects,
    setGlassTransparency,
    setLayout,
    setSolidBg,
    setPresetWallpaper,
    setUserWallpaper,
  }
})
