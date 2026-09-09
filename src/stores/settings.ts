// 用户设置：主题(F1) / 主页文件夹(A2) / 打开方式(G5) / 布局(F6) / 壁纸(F2/F3/F5)
// 主题/布局等小数据存 storage.sync；壁纸图片数据存 storage.local（配额大）
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { onStorageChanged, storageGetMany, storageSet, storageSetMany } from '@/lib/chrome-storage'
import { DEFAULT_LINK_TIMEOUT, normalizeLinkTimeout } from '@/lib/link-checker'
import { normalizeIgnoredDomain, normalizeLinkCheckOptions, type LinkCheckOptions } from '@/lib/link-check-options'

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

export interface DisplaySettings { clock: boolean; yearProgress: boolean; stats: boolean }

function normalizeDisplay(value: unknown): DisplaySettings {
  const source = value && typeof value === 'object' ? value as Partial<DisplaySettings> : {}
  return {
    clock: typeof source.clock === 'boolean' ? source.clock : true,
    yearProgress: typeof source.yearProgress === 'boolean' ? source.yearProgress : true,
    stats: typeof source.stats === 'boolean' ? source.stats : true,
  }
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

function normalizeLayout(value: unknown): LayoutSettings {
  const input = value && typeof value === 'object' ? value as Partial<LayoutSettings> : {}
  const clamp = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  return {
    cardWidth: clamp(input.cardWidth, DEFAULT_LAYOUT.cardWidth, 140, 280),
    cardHeight: clamp(input.cardHeight, DEFAULT_LAYOUT.cardHeight, 40, 80),
    containerWidth: clamp(input.containerWidth, DEFAULT_LAYOUT.containerWidth, 60, 100),
  }
}

type Appearance = { layout: LayoutSettings; glassTransparency: number }
type AppearanceKey = keyof Appearance

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const homeFolderId = ref<string | null>(null)
  const openInNewTab = ref(true)
  const systemDark = ref(false)
  const ready = ref(false)
  const loadError = ref(false)
  const display = ref<DisplaySettings>(normalizeDisplay(null))

  // —— 布局 F6 ——
  const layout = ref<LayoutSettings>({ ...DEFAULT_LAYOUT })

  // —— 性能：关闭毛玻璃模糊（低性能设备降级，仅保留半透明底）——
  const reduceEffects = ref(false)
  /** 面板透明度（0~60%）；0 表示完全不透明。 */
  const glassTransparency = ref(DEFAULT_GLASS_TRANSPARENCY)
  const linkCheckTimeout = ref(DEFAULT_LINK_TIMEOUT)
  const linkCheckOptions = ref<LinkCheckOptions>({ folderId: null, ignoredDomains: [] })

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
  let writeTail: Promise<unknown> | null = null
  let backgroundWriting = false
  let savedAppearance: Appearance = { layout: { ...DEFAULT_LAYOUT }, glassTransparency: DEFAULT_GLASS_TRANSPARENCY }
  let appearanceChanges: Partial<Appearance> = {}
  const appearanceVersions = { layout: 0, glassTransparency: 0 }
  const dirtyAppearance = new Set<AppearanceKey>()
  let appearanceTimer: ReturnType<typeof setTimeout> | undefined
  let appearancePending: { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } | null = null

  function queueWrite<T>(action: () => Promise<T>): Promise<T> {
    const pending = writeTail ? writeTail.then(action, action) : action()
    writeTail = pending
    const finished = () => { if (writeTail === pending) writeTail = null }
    void pending.then(finished, finished)
    return pending
  }

  function applyAppearance(key: AppearanceKey) {
    if (key === 'layout') layout.value = { ...savedAppearance.layout }
    else glassTransparency.value = savedAppearance.glassTransparency
  }

  function flushAppearance(): Promise<void> {
    clearTimeout(appearanceTimer)
    appearanceTimer = undefined
    const deferred = appearancePending
    if (!deferred) return writeTail?.then(() => {}) ?? Promise.resolve()
    const changes = appearanceChanges
    const versions = { ...appearanceVersions }
    appearanceChanges = {}
    appearancePending = null
    const keys = Object.keys(changes) as AppearanceKey[]
    const save = queueWrite(async () => {
      try {
        await storageSetMany(changes)
        savedAppearance = { ...savedAppearance, ...changes }
      } finally {
        // 旧请求完成时不能覆盖用户已输入的新预览。
        for (const key of keys) {
          if (versions[key] !== appearanceVersions[key]) continue
          dirtyAppearance.delete(key)
          applyAppearance(key)
        }
      }
    })
    void save.then(deferred.resolve, deferred.reject)
    return deferred.promise
  }

  function scheduleAppearance(key: AppearanceKey): Promise<void> {
    dirtyAppearance.add(key)
    appearanceVersions[key]++
    if (key === 'layout') appearanceChanges.layout = { ...layout.value }
    else appearanceChanges.glassTransparency = glassTransparency.value
    if (!appearancePending) {
      let resolve!: () => void
      let reject!: (error: unknown) => void
      const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail })
      appearancePending = { promise, resolve, reject }
    }
    clearTimeout(appearanceTimer)
    appearanceTimer = setTimeout(() => { void flushAppearance().catch(() => {}) }, 250)
    return appearancePending.promise
  }

  function onPageHide() { void flushAppearance().catch(() => {}) }

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
    else if (key === 'glassTransparency') {
      savedAppearance.glassTransparency = normalizeTransparency(value)
      if (!dirtyAppearance.has(key)) applyAppearance(key)
    }
    else if (key === 'linkCheckTimeout') linkCheckTimeout.value = normalizeLinkTimeout(value)
    else if (key === 'display') display.value = normalizeDisplay(value)
    else if (key === 'layout') {
      savedAppearance.layout = normalizeLayout(value)
      if (!dirtyAppearance.has(key)) applyAppearance(key)
    }
    else if (!backgroundWriting && key === 'bgKind') bgKind.value = value as BackgroundKind
    else if (!backgroundWriting && key === 'solidBg') solidBg.value = value as string
    else if (!backgroundWriting && key === 'wallpaperId') wallpaperId.value = value as string | null
  }

  function onLocalStorageChange(key: string, value: unknown) {
    if (key === 'wallpaperDataUrl' && !backgroundWriting) wallpaperDataUrl.value = value as string | null
    else if (key === 'linkCheckOptions') linkCheckOptions.value = normalizeLinkCheckOptions(value)
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
      loadError.value = false
      const [synced, local] = await Promise.all([
        storageGetMany({ theme: 'auto' as ThemeMode, homeFolderId: null as string | null,
          openInNewTab: true, reduceEffects: false, glassTransparency: DEFAULT_GLASS_TRANSPARENCY,
          linkCheckTimeout: DEFAULT_LINK_TIMEOUT, display: normalizeDisplay(null), layout: { ...DEFAULT_LAYOUT },
          bgKind: 'solid' as BackgroundKind, solidBg: 'gradient-emerald', wallpaperId: null as string | null }),
        storageGetMany({ linkCheckOptions: { folderId: null, ignoredDomains: [] } as LinkCheckOptions,
          wallpaperDataUrl: null as string | null }, 'local'),
      ])
      theme.value = synced.theme
      homeFolderId.value = synced.homeFolderId
      openInNewTab.value = synced.openInNewTab
      reduceEffects.value = synced.reduceEffects
      savedAppearance = { layout: normalizeLayout(synced.layout), glassTransparency: normalizeTransparency(synced.glassTransparency) }
      for (const key of ['layout', 'glassTransparency'] as const) if (!dirtyAppearance.has(key)) applyAppearance(key)
      linkCheckTimeout.value = normalizeLinkTimeout(synced.linkCheckTimeout)
      display.value = normalizeDisplay(synced.display)
      linkCheckOptions.value = normalizeLinkCheckOptions(local.linkCheckOptions)
      bgKind.value = synced.bgKind
      solidBg.value = synced.solidBg
      wallpaperId.value = synced.wallpaperId
      wallpaperDataUrl.value = local.wallpaperDataUrl

      if (!mediaQuery) {
        mediaQuery = window.matchMedia(THEME_QUERY)
        systemDark.value = mediaQuery.matches
        mediaQuery.addEventListener('change', onSystemThemeChange)
      }
      stopSyncStorage ??= onStorageChanged(onSyncStorageChange)
      stopLocalStorage ??= onStorageChanged(onLocalStorageChange, 'local')
      window.addEventListener('pagehide', onPageHide)

      applyTheme()
      applyLayout()
      applyBackground()
      applyReduceEffects()
      applyGlassTransparency()
      initialized = true
      ready.value = true
    })()

    initPromise = pending
    try {
      await pending
    } catch (error) {
      loadError.value = true
      throw error
    } finally {
      if (initPromise === pending) initPromise = null
    }
  }

  function dispose() {
    onPageHide()
    window.removeEventListener('pagehide', onPageHide)
    stopSyncStorage?.()
    stopSyncStorage = null
    stopLocalStorage?.()
    stopLocalStorage = null

    if (mediaQuery) {
      mediaQuery.removeEventListener('change', onSystemThemeChange)
      mediaQuery = null
    }
    initialized = false
    ready.value = false
    initPromise = null
  }

  async function setTheme(mode: ThemeMode) {
    await storageSet('theme', mode)
    theme.value = mode
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'auto']
    const next = order[(order.indexOf(theme.value) + 1) % order.length]!
    return setTheme(next)
  }

  async function setHomeFolderId(id: string | null) {
    await storageSet('homeFolderId', id)
    homeFolderId.value = id
  }

  async function setOpenInNewTab(value: boolean) {
    await storageSet('openInNewTab', value)
    openInNewTab.value = value
  }

  async function setReduceEffects(value: boolean) {
    await storageSet('reduceEffects', value)
    reduceEffects.value = value
  }

  function setGlassTransparency(value: number) {
    glassTransparency.value = normalizeTransparency(value)
    return scheduleAppearance('glassTransparency')
  }

  async function setLinkCheckTimeout(value: number) {
    const next = normalizeLinkTimeout(value)
    await storageSet('linkCheckTimeout', next)
    linkCheckTimeout.value = next
  }

  function setDisplay(partial: Partial<DisplaySettings>) {
    return queueWrite(async () => {
      const next = normalizeDisplay({ ...display.value, ...partial })
      await storageSet('display', next)
      display.value = next
    })
  }

  async function setLinkCheckOptions(partial: Partial<LinkCheckOptions>) {
    if (partial.ignoredDomains?.some((domain) => !normalizeIgnoredDomain(domain))) throw new Error('Invalid domain')
    return queueWrite(async () => {
      const next = normalizeLinkCheckOptions({ ...linkCheckOptions.value, ...partial })
      await storageSet('linkCheckOptions', next, 'local')
      linkCheckOptions.value = next
    })
  }

  function setLayout(partial: Partial<LayoutSettings>) {
    layout.value = normalizeLayout({ ...layout.value, ...partial })
    return scheduleAppearance('layout')
  }

  function saveBackground(kind: BackgroundKind, id: string | null, dataUrl: string | null, solid?: string) {
    return queueWrite(async () => {
      const previousData = wallpaperDataUrl.value
      const nextSolid = solid ?? solidBg.value
      backgroundWriting = true
      try {
        await storageSet('wallpaperDataUrl', dataUrl, 'local')
        try { await storageSetMany({ bgKind: kind, wallpaperId: id, solidBg: nextSolid }) }
        catch (error) {
          await storageSet('wallpaperDataUrl', previousData, 'local').catch(() => {})
          throw error
        }
        bgKind.value = kind
        solidBg.value = nextSolid
        wallpaperId.value = id
        wallpaperDataUrl.value = dataUrl
      } finally { backgroundWriting = false }
    })
  }

  function setSolidBg(cssClass: string) {
    return saveBackground('solid', null, null, cssClass)
  }

  /** 应用预设壁纸（F2）：仅记录 id，dataURL 用打包资源 URL */
  function setPresetWallpaper(id: string, url: string) {
    return saveBackground('wallpaper', id, url)
  }

  /** 应用用户上传壁纸（F3）：dataURL 存 storage.local */
  function setUserWallpaper(dataUrl: string) {
    return saveBackground('wallpaper', `user:${Date.now()}`, dataUrl)
  }

  return {
    ready,
    loadError,
    display,
    theme,
    homeFolderId,
    openInNewTab,
    reduceEffects,
    glassTransparency,
    linkCheckTimeout,
    linkCheckOptions,
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
    setLinkCheckTimeout,
    setDisplay,
    setLinkCheckOptions,
    setLayout,
    flushAppearance,
    setSolidBg,
    setPresetWallpaper,
    setUserWallpaper,
  }
})
