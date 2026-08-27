// 用户设置：主题(F1) / 主页文件夹(A2) / 打开方式(G5)
// 持久化到 chrome.storage.sync；监听外部变更保持多视图一致
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { onStorageChanged, storageGet, storageSet } from '@/lib/chrome-storage'

export type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = Exclude<ThemeMode, 'auto'>

const THEME_QUERY = '(prefers-color-scheme: dark)'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('auto')
  const homeFolderId = ref<string | null>(null)
  const openInNewTab = ref(true)
  const systemDark = ref(false)

  /** auto 时解析为系统实际主题 */
  const resolvedTheme = computed<ResolvedTheme>(() =>
    theme.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : theme.value,
  )

  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme.value
  }

  watch(resolvedTheme, applyTheme)

  async function init() {
    theme.value = await storageGet<ThemeMode>('theme', 'auto')
    homeFolderId.value = await storageGet<string | null>('homeFolderId', null)
    openInNewTab.value = await storageGet('openInNewTab', true)

    const media = window.matchMedia(THEME_QUERY)
    systemDark.value = media.matches
    media.addEventListener('change', (event) => {
      systemDark.value = event.matches
    })

    onStorageChanged((key, value) => {
      if (key === 'theme') theme.value = value as ThemeMode
      else if (key === 'homeFolderId') homeFolderId.value = value as string | null
      else if (key === 'openInNewTab') openInNewTab.value = value === true
    })

    applyTheme()
  }

  async function setTheme(mode: ThemeMode) {
    theme.value = mode
    await storageSet('theme', mode)
  }

  /** 主题切换按钮：light → dark → auto 循环 */
  function cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'auto']
    const next = order[(order.indexOf(theme.value) + 1) % order.length]!
    void setTheme(next)
  }

  async function setHomeFolderId(id: string | null) {
    homeFolderId.value = id
    await storageSet('homeFolderId', id)
  }

  async function setOpenInNewTab(value: boolean) {
    openInNewTab.value = value
    await storageSet('openInNewTab', value)
  }

  return {
    theme,
    homeFolderId,
    openInNewTab,
    resolvedTheme,
    init,
    setTheme,
    cycleTheme,
    setHomeFolderId,
    setOpenInNewTab,
  }
})
