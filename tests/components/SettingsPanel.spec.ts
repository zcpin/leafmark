import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SettingsPanel from '@/components/SettingsPanel.vue'
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

  it('点击纯色渐变背景应用并持久化（F5）', async () => {
    const { wrapper, settings } = await openPanel()
    const skyBtn = document.body.querySelector('[title="Sky"]') as HTMLElement
    expect(skyBtn).not.toBeNull()
    // 色块按钮须携带渐变色板类（main.css 中定义填充），否则用户看不到色块
    expect(skyBtn.className).toContain('gradient-sky')
    skyBtn.click()
    await vi.waitFor(() => {
      expect(settings.bgKind).toBe('solid')
      expect(settings.solidBg).toBe('gradient-sky')
      expect(chromeMock.__storage.sync.get('solidBg')).toBe('gradient-sky')
    })
    wrapper.unmount()
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

    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement
    expect(slider).not.toBeNull()
    slider.value = '240'
    slider.dispatchEvent(new Event('input'))
    await vi.waitFor(() => {
      expect(settings.layout.cardWidth).toBe(240)
    })
    wrapper.unmount()
  })
})
