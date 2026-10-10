// search store：防抖、范围、结果上限、切换目录自动关闭
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_SEARCH_RESULTS } from '@/lib/bookmark-search'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSearchStore } from '@/stores/search'
import { chromeMock } from '../mocks/chrome'

/** 防抖 120ms，等它过去再断言 */
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
        {
          id: '2',
          title: '其他书签',
          parentId: '0',
          children: [{ id: '20', title: 'Vuex', parentId: '2', url: 'https://vuex.vuejs.org/' }],
        },
      ],
    },
  ]
}

function bigTree(count: number): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          parentId: '0',
          children: Array.from({ length: count }, (_, i) => ({
            id: `n${i}`,
            parentId: '1',
            title: `Vue ${i}`,
            url: `https://vue.test/${i}`,
          })),
        },
      ],
    },
  ]
}

async function initStores() {
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
  useSearchStore().dispose()
  useBookmarksStore().dispose()
  vi.restoreAllMocks()
})

describe('search store', () => {
  it('输入防抖后才产生结果', async () => {
    await initStores()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')

    expect(search.total).toBe(0)
    expect(search.showing).toBe(false)

    await delay(AFTER_DEBOUNCE)
    expect(search.total).toBe(3)
    expect(search.showing).toBe(true)
    // 110 与 20 都是标题以「vue」开头（100），12 只命中标题包含（40）
    expect(search.results.map((hit) => hit.node.id)).toEqual(['110', '20', '12'])
  })

  it('清空会取消尚未触发的防抖', async () => {
    await initStores()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    search.clear()

    await delay(AFTER_DEBOUNCE)
    expect(search.input).toBe('')
    expect(search.total).toBe(0)
  })

  it('结果路径随命中返回', async () => {
    await initStores()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)

    expect(search.paths.get('110')).toEqual(['书签栏', '前端'])
    expect(search.paths.get('20')).toEqual(['其他书签'])
  })

  it('范围切到当前目录后不再搜其他分支', async () => {
    const bookmarks = await initStores()
    bookmarks.setViewFolder('1')
    const search = useSearchStore()
    search.open()
    search.setScope('folder')
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)

    // 只命中 1 号目录下的两条，其他书签下的 Vuex 不参与
    expect(search.results.map((hit) => hit.node.id)).toEqual(['110', '12'])
  })

  it('结果超过上限时截断并统计未显示数量', async () => {
    chromeMock.bookmarks.__setTree(bigTree(MAX_SEARCH_RESULTS + 50))
    await initStores()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)

    expect(search.total).toBe(MAX_SEARCH_RESULTS + 50)
    expect(search.results.length).toBe(MAX_SEARCH_RESULTS)
    expect(search.hiddenCount).toBe(50)
  })

  it('关闭搜索会清空查询并把范围重置为全部书签', async () => {
    await initStores()
    const search = useSearchStore()
    search.open()
    search.setScope('folder')
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)
    search.close()

    expect(search.active).toBe(false)
    expect(search.input).toBe('')
    expect(search.scope).toBe('all')
    expect(search.showing).toBe(false)
  })

  it('切换目录后自动结束搜索', async () => {
    const bookmarks = await initStores()
    const search = useSearchStore()
    search.open()
    search.setInput('vue')
    await delay(AFTER_DEBOUNCE)
    expect(search.showing).toBe(true)

    bookmarks.setViewFolder('2')
    await delay(AFTER_DEBOUNCE + 20)

    expect(search.active).toBe(false)
    expect(search.showing).toBe(false)
  })
})
