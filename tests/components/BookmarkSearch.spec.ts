// 搜索 UI：输入框（防抖、两段式 Esc、回车）与结果视图（路径副标题、空态、跳转）
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SearchBox from '@/components/SearchBox.vue'
import SearchResults from '@/components/SearchResults.vue'
import { MAX_SEARCH_RESULTS } from '@/lib/bookmark-search'
import { t } from '@/lib/i18n'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSearchStore } from '@/stores/search'
import { chromeMock } from '../mocks/chrome'

const AFTER_DEBOUNCE = 160
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sampleTree(): BookmarkNode[] {
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
            {
              id: '11',
              title: '前端',
              parentId: '1',
              children: [
                { id: '110', title: 'Vue Guide', parentId: '11', url: 'https://vuejs.org/guide' },
              ],
            },
            { id: '12', title: 'Other Vue', parentId: '1', url: 'https://other.test/vue' },
          ],
        },
      ],
    },
  ]
}

let wrapper: VueWrapper

async function initBookmarks() {
  const bookmarks = useBookmarksStore()
  await bookmarks.init()
  return bookmarks
}

beforeEach(() => {
  setActivePinia(createPinia())
  chromeMock.__reset()
  chromeMock.bookmarks.__setTree(sampleTree())
})

afterEach(() => {
  wrapper?.unmount()
  useSearchStore().dispose()
  useBookmarksStore().dispose()
  vi.restoreAllMocks()
})

describe('SearchBox', () => {
  async function mountBox() {
    const search = useSearchStore()
    search.open()
    wrapper = mount(SearchBox)
    await nextTick()
    return search
  }

  it('输入后显示结果条数', async () => {
    await initBookmarks()
    await mountBox()

    await wrapper.find('input').setValue('vue')
    await delay(AFTER_DEBOUNCE)
    await nextTick()

    expect(wrapper.text()).toContain(t('searchResultsCount', { n: 2 }))
  })

  it('清空按钮立即清空输入与结果', async () => {
    await initBookmarks()
    await mountBox()

    await wrapper.find('input').setValue('vue')
    await delay(AFTER_DEBOUNCE)
    await nextTick()
    const clearButton = wrapper.findAll('button').at(-1)!
    await clearButton.trigger('click')

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain(t('searchResultsCount', { n: 2 }))
  })

  it('有输入时 Esc 只清空，不关闭', async () => {
    await initBookmarks()
    await mountBox()

    await wrapper.find('input').setValue('vue')
    await delay(AFTER_DEBOUNCE)
    await nextTick()
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toBeUndefined()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('输入为空时 Esc 关闭搜索框', async () => {
    await initBookmarks()
    await mountBox()

    await wrapper.find('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('回车请求打开第一条结果', async () => {
    await initBookmarks()
    await mountBox()

    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('openFirst')).toHaveLength(1)
  })

  it('范围按钮在全部书签与仅当前目录之间切换', async () => {
    await initBookmarks()
    const search = await mountBox()

    const scopeButton = wrapper.findAll('button').at(0)!
    expect(scopeButton.text()).toBe(t('searchAllBookmarks'))
    await scopeButton.trigger('click')

    expect(search.scope).toBe('folder')
    expect(wrapper.findAll('button').at(0)!.text()).toBe(t('searchInFolder'))
  })
})

describe('SearchResults', () => {
  async function mountResults(query: string) {
    await initBookmarks()
    const search = useSearchStore()
    search.open()
    search.setInput(query)
    await delay(AFTER_DEBOUNCE)
    wrapper = mount(SearchResults, { attachTo: document.body })
    await nextTick()
    return search
  }

  it('渲染命中卡片与所在文件夹路径', async () => {
    await mountResults('vue')

    const cards = wrapper.findAll('.bookmark-card')
    expect(cards.length).toBe(2)
    expect(wrapper.text()).toContain('书签栏 / 前端')
  })

  it('无命中时显示空态', async () => {
    await mountResults('zzzz')

    expect(wrapper.findAll('.bookmark-card').length).toBe(0)
    expect(wrapper.text()).toContain(t('searchNoResults'))
  })

  it('结果里的文件夹卡片点击进入该目录并结束搜索', async () => {
    const search = await mountResults('前端')

    await wrapper.find('.bookmark-card').trigger('click')
    await nextTick()

    expect(useBookmarksStore().currentFolder?.id).toBe('11')
    expect(search.active).toBe(false)
  })

  it('结果超过上限时提示未显示数量', async () => {
    chromeMock.bookmarks.__setTree([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            parentId: '0',
            children: Array.from({ length: MAX_SEARCH_RESULTS + 10 }, (_, i) => ({
              id: `n${i}`,
              parentId: '1',
              title: `Vue ${i}`,
              url: `https://vue.test/${i}`,
            })),
          },
        ],
      },
    ])
    await initBookmarks()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)
    wrapper = mount(SearchResults, { attachTo: document.body })
    await nextTick()

    expect(wrapper.text()).toContain(t('searchTruncated', { n: 10 }))
    expect(wrapper.findAll('.bookmark-card').length).toBe(MAX_SEARCH_RESULTS)
  })

  it('结果视图支持方向键在卡片间移动焦点', async () => {
    await mountResults('vue')

    const cards = wrapper.findAll('.bookmark-card')
    await cards[0]!.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Other Vue')
  })

  it('结果视图不响应拖放', async () => {
    await mountResults('vue')

    const transfer = new DataTransfer()
    transfer.setData('text/plain', '110')
    await wrapper.find('.bookmark-card').trigger('drop', { dataTransfer: transfer })

    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })
})
