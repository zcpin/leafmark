// 语言探测结果缓存：大网格下 t() 会被调用上万次，不能每次都读 chrome.i18n
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetUiLocaleCache, t, uiLanguage, uiLocale } from '@/lib/i18n'
import { chromeMock } from '../mocks/chrome'

describe('i18n 语言缓存', () => {
  beforeEach(() => {
    resetUiLocaleCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('一次生命周期内只探测一次浏览器语言', () => {
    const spy = vi.spyOn(chromeMock.i18n, 'getUILanguage')

    expect(uiLanguage()).toBe('zh-CN')
    expect(uiLocale()).toBe('zh_CN')
    t('appName')
    t('settings', { n: 1 })
    uiLanguage()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('resetUiLocaleCache 后重新探测', () => {
    const spy = vi.spyOn(chromeMock.i18n, 'getUILanguage')
    expect(uiLocale()).toBe('zh_CN')

    resetUiLocaleCache()
    expect(uiLocale()).toBe('zh_CN')

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('languagechange 事件后改用新的语言', async () => {
    expect(t('settings')).toBe('设置')
    vi.spyOn(chromeMock.i18n, 'getUILanguage').mockReturnValue('en-US')

    window.dispatchEvent(new Event('languagechange'))

    expect(uiLocale()).toBe('en')
    expect(t('settings')).toBe('Settings')

    resetUiLocaleCache()
  })

  it('未知语言回落到英文', () => {
    vi.spyOn(chromeMock.i18n, 'getUILanguage').mockReturnValue('fr-FR')
    resetUiLocaleCache()

    expect(uiLocale()).toBe('en')
    expect(t('appName')).toBe('Leafmark')

    resetUiLocaleCache()
  })
})
