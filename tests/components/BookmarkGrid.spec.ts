// 网格空白区拖放（A4）：拖到空白处 → 移到当前目录末尾
// 覆盖有效落点、非法来源、多选抑制、失败回退与高亮清理
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BookmarkGrid from '@/components/BookmarkGrid.vue'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'
import { chromeMock } from '../mocks/chrome'

const RING = 'ring-emerald-400/50'
let wrapper: VueWrapper

function transfer(sourceId?: string): DataTransfer {
  const dt = new DataTransfer()
  if (sourceId) dt.setData('text/plain', sourceId)
  return dt
}

async function mountGrid(folderId = '1') {
  const bookmarks = useBookmarksStore()
  await bookmarks.init()
  bookmarks.setViewFolder(folderId)
  await nextTick()
  wrapper = mount(BookmarkGrid, { attachTo: document.body })
  return bookmarks
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  useBookmarksStore().dispose()
  vi.restoreAllMocks()
})

describe('BookmarkGrid（大目录窗口化渲染）', () => {
  let resizeCallback: (() => void) | undefined

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
            children: [
              {
                id: 'big',
                title: '大目录',
                parentId: '1',
                children: Array.from({ length: count }, (_, i) => ({
                  id: `m${i}`,
                  parentId: 'big',
                  title: `Item ${i}`,
                  url: `https://x.test/${i}`,
                })),
              },
            ],
          },
          { id: '2', title: '其他书签', parentId: '0', children: [] },
        ],
      },
    ]
  }

  async function mountBigGrid(count: number) {
    chromeMock.bookmarks.__setTree(bigTree(count))
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    bookmarks.setViewFolder('big')
    await nextTick()
    wrapper = mount(BookmarkGrid, { attachTo: document.body })
    return bookmarks
  }

  /** 让组件读到真实的几何信息：列数来自展开后的轨道，视口高度来自滚动容器 */
  function applyGeometry(viewportHeight: number, columnCount: number, rowGap = 12) {
    const scroller = wrapper.element as HTMLElement
    Object.defineProperty(scroller, 'clientHeight', { value: viewportHeight, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: columnCount * 200, configurable: true })
    const grid = scroller.querySelector<HTMLElement>('.grid')!
    grid.style.gridTemplateColumns = Array.from({ length: columnCount }, () => '200px').join(' ')
    grid.style.rowGap = `${rowGap}px`
    resizeCallback?.()
  }

  function scrollTo(top: number) {
    const scroller = wrapper.element as HTMLElement
    Object.defineProperty(scroller, 'scrollTop', { value: top, configurable: true })
    scroller.dispatchEvent(new Event('scroll'))
  }

  const spacer = () => wrapper.element.firstElementChild as HTMLElement

  beforeEach(() => {
    resizeCallback = undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = () => callback([], this as unknown as ResizeObserver)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('大目录只挂载视口附近的行，其余用占位高度撑开', async () => {
    const bookmarks = await mountBigGrid(300)
    applyGeometry(400, 3)
    await nextTick()

    expect(bookmarks.currentChildren).toHaveLength(300)
    const mounted = wrapper.findAll('.bookmark-card')
    expect(mounted).toHaveLength(27) // (ceil(400/60) + 2 行) × 3 列
    expect(mounted[0]?.attributes('aria-label')).toBe('Item 0')
    expect(spacer().style.paddingTop).toBe('0px')
    expect(spacer().style.paddingBottom).toBe('5460px') // (100 - 9) 行 × 60px
  })

  it('滚动后窗口跟随视口移动，上下占位与偏移量一致', async () => {
    await mountBigGrid(300)
    applyGeometry(400, 3)
    await nextTick()
    scrollTo(600)
    await nextTick()

    const mounted = wrapper.findAll('.bookmark-card')
    expect(mounted[0]?.attributes('aria-label')).toBe('Item 24') // (600/60 - 2) 行 × 3
    expect(mounted).toHaveLength(33)
    expect(spacer().style.paddingTop).toBe('480px')
    expect(spacer().style.paddingBottom).toBe('4860px')
  })

  it('滚到底部时最后一项仍然渲染，且不再预留底部占位', async () => {
    await mountBigGrid(300)
    applyGeometry(400, 3)
    await nextTick()
    scrollTo(5588) // 内容高 5988 − 视口 400
    await nextTick()

    const mounted = wrapper.findAll('.bookmark-card')
    expect(mounted.at(-1)?.attributes('aria-label')).toBe('Item 299')
    expect(spacer().style.paddingBottom).toBe('0px')
  })

  it('scrollTop 超出内容时夹紧到最后一行，不会渲染空窗口', async () => {
    await mountBigGrid(300)
    applyGeometry(400, 3)
    await nextTick()
    scrollTo(999999)
    await nextTick()

    expect(wrapper.findAll('.bookmark-card').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.bookmark-card').at(-1)?.attributes('aria-label')).toBe('Item 299')
  })

  it('拿不到视口尺寸时回退为全量挂载', async () => {
    await mountBigGrid(80)
    await nextTick()
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(80)
    expect(spacer().style.paddingBottom).toBe('0px')
  })

  it('列数变化后重新计算窗口', async () => {
    await mountBigGrid(300)
    applyGeometry(400, 3)
    await nextTick()
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(27)

    applyGeometry(400, 5)
    await nextTick()
    // 60 行 × 5 列；视口 400px 仍是 7 行 + 2 行 overscan
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(45)
    expect(spacer().style.paddingBottom).toBe('3060px') // (60 - 9) 行 × 60px
  })
})

describe('BookmarkGrid（空白区拖放）', () => {
  it('拖到网格空白区移到当前目录末尾，并清理拖拽态', async () => {
    const bookmarks = await mountGrid()
    const dt = transfer('10')
    await wrapper.trigger('dragover', { dataTransfer: dt })
    expect(wrapper.classes()).toContain(RING)
    await wrapper.trigger('drop', { dataTransfer: dt })

    await vi.waitFor(() =>
      expect(chromeMock.bookmarks.move).toHaveBeenCalledWith(
        '10',
        { parentId: '1', index: 2 },
        expect.any(Function),
      ),
    )
    await vi.waitFor(() =>
      expect(chromeMock.bookmarks.__find('1')?.children?.map((node) => node.id)).toEqual([
        '11',
        '10',
      ]),
    )
    expect(bookmarks.draggingId).toBeNull()
    expect(wrapper.classes()).not.toContain(RING)
  })

  it('空文件夹可以接收拖入的项目', async () => {
    await mountGrid('2')
    expect(wrapper.text()).toContain('这个文件夹是空的')
    const dt = transfer('11')
    await wrapper.trigger('dragover', { dataTransfer: dt })
    await wrapper.trigger('drop', { dataTransfer: dt })

    await vi.waitFor(() =>
      expect(chromeMock.bookmarks.__find('2')?.children?.map((node) => node.id)).toEqual(['11']),
    )
  })

  it('已经位于末尾的项目不再触发移动', async () => {
    await mountGrid()
    const dt = transfer('11')
    await wrapper.trigger('dragover', { dataTransfer: dt })
    expect(wrapper.classes()).not.toContain(RING)
    await wrapper.trigger('drop', { dataTransfer: dt })
    await nextTick()
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('缺少拖拽来源时不移动也不显示落点提示', async () => {
    await mountGrid()
    const dt = transfer()
    await wrapper.trigger('dragover', { dataTransfer: dt })
    expect(wrapper.classes()).not.toContain(RING)
    await wrapper.trigger('drop', { dataTransfer: dt })
    await nextTick()
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('多选模式下网格不接收拖放', async () => {
    await mountGrid()
    const selection = useSelectionStore()
    selection.start()
    await nextTick()
    expect(selection.active).toBe(true)

    const dt = transfer('10')
    await wrapper.trigger('dragover', { dataTransfer: dt })
    expect(wrapper.classes()).not.toContain(RING)
    await wrapper.trigger('drop', { dataTransfer: dt })
    await nextTick()
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()

    selection.end()
  })

  it('移动失败时提示并重新载入，不残留拖拽态', async () => {
    const bookmarks = await mountGrid()
    bookmarks.draggingId = '10'
    chromeMock.bookmarks.move.mockImplementationOnce((_id, _destination, callback) => {
      chromeMock.runtime.lastError = { message: 'move failed' }
      callback(undefined as unknown as BookmarkNode)
      chromeMock.runtime.lastError = null
    })
    await wrapper.trigger('drop', { dataTransfer: transfer('10') })

    await vi.waitFor(() => expect(useUiStore().toasts).toHaveLength(1))
    expect(useUiStore().toasts[0]?.message).toContain('书签移动失败')
    expect(bookmarks.draggingId).toBeNull()
  })

  it('dragleave 清除落点高亮', async () => {
    await mountGrid()
    await wrapper.trigger('dragover', { dataTransfer: transfer('10') })
    expect(wrapper.classes()).toContain(RING)
    await wrapper.trigger('dragleave')
    expect(wrapper.classes()).not.toContain(RING)
  })

  it('渲染当前目录的全部直接子项', async () => {
    await mountGrid('10')
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('GitHub')
    expect(wrapper.text()).toContain('前端')
  })
})

describe('BookmarkGrid（方向键网格导航）', () => {
  let resizeCallback: (() => void) | undefined

  function navTree(count: number): BookmarkNode[] {
    return [
      {
        id: '0',
        title: '',
        children: [
          {
            id: 'nav',
            title: '导航目录',
            parentId: '0',
            children: Array.from({ length: count }, (_, i) => ({
              id: `n${i}`,
              parentId: 'nav',
              title: `Item ${i}`,
              url: `https://x.test/${i}`,
            })),
          },
        ],
      },
    ]
  }

  async function mountNav(count: number) {
    chromeMock.bookmarks.__setTree(navTree(count))
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    bookmarks.setViewFolder('nav')
    await nextTick()
    wrapper = mount(BookmarkGrid, { attachTo: document.body })
    await nextTick()
    return bookmarks
  }

  const cards = () => wrapper.findAll('.bookmark-card')

  async function press(index: number, key: string) {
    await cards()[index]!.trigger('keydown', { key })
    await nextTick()
  }

  const focusedLabel = () => document.activeElement?.getAttribute('aria-label') ?? null

  /** 3 列 × 视口 400px；scrollTop 可写，便于验证滚动跟随 */
  function applyGeometry(columnCount = 3, viewportHeight = 400) {
    const scroller = wrapper.element as HTMLElement
    Object.defineProperty(scroller, 'clientHeight', { value: viewportHeight, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: columnCount * 200, configurable: true })
    const grid = scroller.querySelector<HTMLElement>('.grid')!
    grid.style.gridTemplateColumns = Array.from({ length: columnCount }, () => '200px').join(' ')
    grid.style.rowGap = '12px'
    let top = 0
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => top,
      set: (value: number) => {
        top = Number(value)
      },
      configurable: true,
    })
    resizeCallback?.()
  }

  const scrollTop = () => (wrapper.element as HTMLElement).scrollTop

  beforeEach(() => {
    resizeCallback = undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = () => callback([], this as unknown as ResizeObserver)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('左右键在卡片间移动焦点', async () => {
    await mountNav(5)

    await press(0, 'ArrowRight')
    expect(focusedLabel()).toBe('Item 1')

    await press(1, 'ArrowRight')
    expect(focusedLabel()).toBe('Item 2')

    await press(2, 'ArrowLeft')
    expect(focusedLabel()).toBe('Item 1')
  })

  it('测不到列数时上下键退化为前后移动', async () => {
    await mountNav(5)

    await press(0, 'ArrowDown')
    expect(focusedLabel()).toBe('Item 1')

    await press(1, 'ArrowUp')
    expect(focusedLabel()).toBe('Item 0')
  })

  it('按实际列数上下移动一整行', async () => {
    await mountNav(9)
    applyGeometry(3)
    await nextTick()

    await press(0, 'ArrowDown')
    expect(focusedLabel()).toBe('Item 3')

    await press(3, 'ArrowDown')
    expect(focusedLabel()).toBe('Item 6')

    await press(6, 'ArrowUp')
    expect(focusedLabel()).toBe('Item 3')
  })

  it('Home / End 跳到首尾，越界时保持在当前项', async () => {
    await mountNav(9)
    applyGeometry(3)
    await nextTick()

    await press(0, 'End')
    expect(focusedLabel()).toBe('Item 8')

    await press(8, 'Home')
    expect(focusedLabel()).toBe('Item 0')

    await press(0, 'ArrowLeft')
    expect(focusedLabel()).toBe('Item 0')

    await press(0, 'ArrowUp')
    expect(focusedLabel()).toBe('Item 0')

    await press(0, 'End')
    await press(8, 'ArrowRight')
    expect(focusedLabel()).toBe('Item 8')
  })

  it('只有当前焦点项可 Tab 进入（roving tabindex）', async () => {
    await mountNav(4)
    expect(cards().map((card) => card.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])

    await press(0, 'ArrowRight')
    expect(cards().map((card) => card.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
  })

  it('焦点进入某张卡片后更新 roving 位置', async () => {
    await mountNav(4)
    cards()[2]!.element.focus()
    await nextTick()

    expect(cards().map((card) => card.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
    await press(2, 'ArrowRight')
    expect(focusedLabel()).toBe('Item 3')
  })

  it('虚拟化目录里 End 把最后一行滚入视口并聚焦最后一项', async () => {
    await mountNav(300)
    applyGeometry(3)
    await nextTick()
    expect(cards().length).toBeLessThan(300)

    await press(0, 'End')

    expect(focusedLabel()).toBe('Item 299')
    expect(scrollTop()).toBeGreaterThan(0)
    expect(cards().at(-1)?.attributes('aria-label')).toBe('Item 299')
  })

  it('非导航键不拦截，交给卡片自身处理', async () => {
    await mountNav(4)
    const seen: KeyboardEvent[] = []
    const listener = (event: Event) => seen.push(event as KeyboardEvent)
    window.addEventListener('keydown', listener)

    cards()[0]!.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    cards()[0]!.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }),
    )
    window.removeEventListener('keydown', listener)
    await nextTick()

    expect(seen).toHaveLength(2)
    expect(seen[0]?.defaultPrevented).toBe(true)
    expect(seen[1]?.defaultPrevented).toBe(false)
  })
})
