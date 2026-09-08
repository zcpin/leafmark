import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import App from '@/newtab/App.vue'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

describe('App 布局', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('书签浮岛宽度消费 settings 的 containerWidth', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BookmarkGrid: true,
          Breadcrumb: true,
          Clock: true,
          ConfirmDialog: true,
          EditBookmarkDialog: true,
          Icon: true,
          OnboardingOverlay: true,
          QrCodeDialog: true,
          SettingsPanel: true,
          ToastStack: true,
          YearProgress: true,
          LinkCheckDialog: true,
          DuplicateDialog: true,
          UndoDeleteButton: true,
        },
      },
    })

    await Promise.resolve()
    const island = wrapper.element.querySelector('div[style]')
    expect(island?.getAttribute('style')).toContain('width: 85%')

    const settings = useSettingsStore()
    await settings.setLayout({ containerWidth: 70 })
    await nextTick()
    expect(island?.getAttribute('style')).toContain('width: 70%')

    wrapper.unmount()
  })

  it('分别隐藏时钟、进度和统计，同时保留书签区', async () => {
    const wrapper = mount(App, { global: { stubs: {
      BookmarkGrid: true, Breadcrumb: true, Clock: true, ConfirmDialog: true,
      EditBookmarkDialog: true, Icon: true, OnboardingOverlay: true, QrCodeDialog: true,
      SettingsPanel: true, ToastStack: true, YearProgress: true, LinkCheckDialog: true,
      DuplicateDialog: true, UndoDeleteButton: true,
    } } })
    const settings = useSettingsStore()
    await settings.init()
    expect(wrapper.find('clock-stub').exists()).toBe(true)
    await settings.setDisplay({ clock: false })
    await nextTick()
    expect(wrapper.find('clock-stub').exists()).toBe(false)
    expect(wrapper.find('year-progress-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('个书签')
    await settings.setDisplay({ yearProgress: false, stats: false })
    await nextTick()
    expect(wrapper.find('footer').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('个书签')
    expect(wrapper.find('bookmark-grid-stub').exists()).toBe(true)
    wrapper.unmount()
  })
})
