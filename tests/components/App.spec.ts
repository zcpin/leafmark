import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import App from '@/newtab/App.vue'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSearchStore } from '@/stores/search'
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
          RecycleBinButton: true,
          RecycleBinDialog: true,
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
          RecycleBinButton: true,
          RecycleBinDialog: true,
        },
      },
    })
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

describe('App 搜索入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  const baseStubs = {
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
    RecycleBinButton: true,
    RecycleBinDialog: true,
    SearchBox: true,
    SearchResults: true,
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** 默认全部替换成 stub；realComponents 里的组件用真实实现 */
  function mountApp(realComponents: string[] = []) {
    const stubs: Record<string, boolean> = { ...baseStubs }
    for (const name of realComponents) delete stubs[name]
    return mount(App, { global: { stubs } })
  }

  function searchTree(): BookmarkNode[] {
    return [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            parentId: '0',
            children: [
              { id: '10', title: 'Vue Guide', parentId: '1', url: 'https://vuejs.org/guide' },
            ],
          },
        ],
      },
    ]
  }

  it('`/` 唤起搜索：显示搜索框并隐藏面包屑', async () => {
    const wrapper = mountApp()
    await useBookmarksStore().load()

    const search = useSearchStore()
    expect(search.active).toBe(false)

    await wrapper.trigger('keydown', { key: '/' })
    await nextTick()

    expect(search.active).toBe(true)
    expect(wrapper.find('search-box-stub').exists()).toBe(true)
    expect(wrapper.find('breadcrumb-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('结果态下主区渲染搜索结果而不是网格', async () => {
    chromeMock.bookmarks.__setTree(searchTree())
    const wrapper = mountApp()
    await useBookmarksStore().load()

    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    await delay(160)
    await nextTick()

    expect(wrapper.find('search-results-stub').exists()).toBe(true)
    expect(wrapper.find('bookmark-grid-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('结果态回车打开第一条书签', async () => {
    chromeMock.bookmarks.__setTree(searchTree())
    const wrapper = mountApp(['SearchBox'])
    await useBookmarksStore().load()

    const search = useSearchStore()
    search.open()
    await nextTick()
    const input = wrapper.find('input')
    await input.setValue('vue')
    await delay(160)
    await nextTick()
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://vuejs.org/guide' }),
      expect.anything(),
    )
    wrapper.unmount()
  })

  it('输入框内按 `/` 不会重复唤起搜索', async () => {
    const wrapper = mountApp(['SearchBox'])
    await useBookmarksStore().load()
    const search = useSearchStore()
    search.open()
    await nextTick()

    const input = wrapper.find('input')
    await input.trigger('keydown', { key: '/' })

    expect(search.input).toBe('')
    wrapper.unmount()
  })
})
