import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SettingsPanel from '@/components/SettingsPanel.vue'
import ToastStack from '@/components/ToastStack.vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

async function openPanel() {
  const settings = useSettingsStore()
  await settings.init()
  const wrapper = mount(SettingsPanel, { attachTo: document.body })
  wrapper.vm.show?.()
  await nextTick()
  return { wrapper, settings }
}

describe('SettingsPanel（F2/F3/F5/F6 设置面板）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('show() 打开毛玻璃抽屉，含三个分区页签', async () => {
    const { wrapper } = await openPanel()
    const panel = document.body.querySelector('aside')
    expect(panel).not.toBeNull()
    const text = panel!.textContent ?? ''
    expect(text).toContain('外观')
    expect(text).toContain('布局')
    expect(text).toContain('通用')
    wrapper.unmount()
  })

  it('通用设置的检测入口打开工具并收起设置面板', async () => {
    const { wrapper, settings } = await openPanel()
    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
    buttons.find((button) => button.textContent?.trim() === '通用')!.click()
    await nextTick()
    buttons.find((button) => button.textContent?.trim() === '检测收藏链接')!.click()
    await nextTick()
    expect(useLinkCheckerStore().open).toBe(true)
    expect(document.body.querySelector('aside')).toBeNull()
    wrapper.unmount()
    settings.dispose()
  })

  it('显示当前主页目录名称，并在改名或删除后更新状态', async () => {
    const { wrapper, settings } = await openPanel()
    const bookmarks = useBookmarksStore()
    try {
      await bookmarks.init()
      await settings.setHomeFolderId('10')
      const generalTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
        .find((button) => button.textContent?.trim() === '通用')
      generalTab!.click()
      await nextTick()
      const panel = document.body.querySelector('aside')!
      expect(panel.textContent).toContain('开发')

      await bookmarks.updateBookmark('10', { title: '工作资料' })
      await nextTick()
      expect(panel.textContent).toContain('工作资料')

      chromeMock.bookmarks.removeTree('10', () => {})
      await vi.waitFor(() => {
        expect(panel.textContent).toContain('主页目录不可用')
        expect(panel.textContent).toContain('新标签页将打开默认书签栏')
        expect(panel.textContent).not.toContain('工作资料')
      })
    } finally {
      wrapper.unmount()
      settings.dispose()
      bookmarks.dispose()
    }
  })

  it('恢复主页保存失败时保留目录并显示提示，随后可重试成功', async () => {
    const { wrapper, settings } = await openPanel()
    const bookmarks = useBookmarksStore()
    const toasts = mount(ToastStack)
    try {
      await bookmarks.init()
      await settings.setHomeFolderId('10')
      bookmarks.setViewFolder('10')
      const generalTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
        .find((button) => button.textContent?.trim() === '通用')
      generalTab!.click()
      await nextTick()
      const reset = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
        .find((button) => button.textContent?.trim() === '恢复默认主页')!
      chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
        chromeMock.runtime.lastError = { message: 'storage unavailable' }
        callback()
        chromeMock.runtime.lastError = null
      })

      reset.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('主页设置保存失败，已保留原设置，请重试。')
        expect(settings.homeFolderId).toBe('10')
        expect(bookmarks.viewFolderId).toBe('10')
        expect(bookmarks.currentFolder?.id).toBe('10')
        expect(reset.disabled).toBe(false)
      })

      reset.click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('已恢复默认主页')
        expect(bookmarks.currentFolder?.id).toBe('1')
        expect(chromeMock.__storage.sync.get('homeFolderId')).toBeNull()
      })
    } finally {
      wrapper.unmount()
      toasts.unmount()
      settings.dispose()
      bookmarks.dispose()
    }
  })

  it('通用设置可恢复已不可见的主页目录，重新打开页面后仍使用默认书签栏', async () => {
    const { wrapper, settings } = await openPanel()
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    await settings.setHomeFolderId('missing-folder')
    bookmarks.setViewFolder('10')

    const generalTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
      .find((button) => button.textContent?.trim() === '通用')
    generalTab!.click()
    await nextTick()
    const reset = Array.from(document.body.querySelectorAll<HTMLButtonElement>('aside button'))
      .find((button) => button.textContent?.trim() === '恢复默认主页')
    expect(reset).toBeDefined()
    expect(reset!.disabled).toBe(false)
    reset!.click()

    await vi.waitFor(() => {
      expect(settings.homeFolderId).toBeNull()
      expect(chromeMock.__storage.sync.get('homeFolderId')).toBeNull()
      expect(bookmarks.viewFolderId).toBeNull()
      expect(bookmarks.currentFolder?.id).toBe('1')
      expect(reset!.disabled).toBe(true)
    })
    wrapper.unmount()
    settings.dispose()
    bookmarks.dispose()

    setActivePinia(createPinia())
    const reopenedSettings = useSettingsStore()
    const reopenedBookmarks = useBookmarksStore()
    await reopenedSettings.init()
    await reopenedBookmarks.init()
    expect(reopenedSettings.homeFolderId).toBeNull()
    expect(reopenedBookmarks.currentFolder?.id).toBe('1')
    reopenedSettings.dispose()
    reopenedBookmarks.dispose()
  })

  it('点击纯色渐变背景应用并持久化（F5）', async () => {
    const { wrapper, settings } = await openPanel()
    const skyBtn = document.body.querySelector('[title="晴空"]') as HTMLElement
    expect(skyBtn).not.toBeNull()
    expect(skyBtn.querySelector('span')?.style.backgroundImage).toContain('linear-gradient')
    skyBtn.click()
    await vi.waitFor(() => {
      expect(settings.bgKind).toBe('solid')
      expect(settings.solidBg).toBe('gradient-sky')
      expect(chromeMock.__storage.sync.get('solidBg')).toBe('gradient-sky')
    })
    wrapper.unmount()
  })

  it('外观滑块调整面板透明度，保存失败时恢复滑块并提示', async () => {
    const { wrapper, settings } = await openPanel()
    const toasts = mount(ToastStack)
    try {
      const slider = document.body.querySelector<HTMLInputElement>('input[aria-label="面板透明度"]')!
      expect(slider).not.toBeNull()
      slider.value = '0'
      slider.dispatchEvent(new Event('input'))
      await vi.waitFor(() => {
        expect(settings.glassTransparency).toBe(0)
        expect(chromeMock.__storage.sync.get('glassTransparency')).toBe(0)
        expect(document.documentElement.style.getPropertyValue('--lm-glass-opacity')).toBe('1')
      })

      chromeMock.storage.sync.set.mockImplementationOnce((_items, callback) => {
        chromeMock.runtime.lastError = { message: 'storage unavailable' }
        callback()
        chromeMock.runtime.lastError = null
      })
      slider.value = '60'
      slider.dispatchEvent(new Event('input'))
      await vi.waitFor(() => {
        expect(settings.glassTransparency).toBe(0)
        expect(slider.value).toBe('0')
        expect(document.body.textContent).toContain('外观设置保存失败，请重试。')
      })
    } finally {
      wrapper.unmount()
      toasts.unmount()
      settings.dispose()
    }
  })

  it('点击预设壁纸应用壁纸模式（F2）', async () => {
    const { wrapper, settings } = await openPanel()
    const presetBtn = document.body.querySelector('[title="Aurora"]') as HTMLElement
    expect(presetBtn).not.toBeNull()
    presetBtn.click()
    await vi.waitFor(() => {
      expect(settings.bgKind).toBe('wallpaper')
      expect(settings.wallpaperId).toBe('preset-2')
      expect(chromeMock.__storage.local.get('wallpaperDataUrl')).toBeTruthy()
    })
    wrapper.unmount()
  })

  it('布局页签滑块读写 settings.layout（F6）', async () => {
    const { wrapper, settings } = await openPanel()
    const layoutTab = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '布局',
    ) as HTMLElement
    layoutTab.click()
    await nextTick()

    const widthLabel = Array.from(document.body.querySelectorAll('aside label')).find(
      (label) => label.textContent?.includes('卡片宽度'),
    )
    const slider = widthLabel?.querySelector('input[type="range"]') as HTMLInputElement
    expect(slider).not.toBeNull()
    slider.value = '240'
    slider.dispatchEvent(new Event('input'))
    await vi.waitFor(() => {
      expect(settings.layout.cardWidth).toBe(240)
    })
    wrapper.unmount()
  })
})
