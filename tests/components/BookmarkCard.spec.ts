import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BookmarkCard from '@/components/BookmarkCard.vue'
import BookmarkGrid from '@/components/BookmarkGrid.vue'
import QrCodeDialog from '@/components/QrCodeDialog.vue'
import { openAllInGroup, openUrl } from '@/lib/tabs'
import { findNode } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { SAMPLE_TREE, chromeMock } from '../mocks/chrome'

vi.mock('@/lib/tabs', () => ({
  openUrl: vi.fn(),
  openAllInGroup: vi.fn().mockResolvedValue(undefined),
}))

const github = findNode(SAMPLE_TREE, '100') as BookmarkNode
const devFolder = findNode(SAMPLE_TREE, '10') as BookmarkNode

describe('BookmarkCard（Phase 2：拖拽 / 批量打开 / 二维码）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }])('Ctrl/⌘ 点击后台打开，不受当前页设置影响：%o', async (modifiers) => {
    useSettingsStore().openInNewTab = false
    const wrapper = mount(BookmarkCard, { props: { node: github } })
    await wrapper.trigger('click', { button: 0, ...modifiers })
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com', true, false)
    wrapper.unmount()
  })

  it('中键仅打开一次后台标签，Ctrl+Shift 则前台打开', async () => {
    const wrapper = mount(BookmarkCard, { props: { node: github } })
    await wrapper.trigger('click', { button: 1 })
    await wrapper.trigger('auxclick', { button: 1 })
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com', true, false)
    vi.mocked(openUrl).mockClear()
    await wrapper.trigger('click', { button: 0, ctrlKey: true, shiftKey: true })
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com', true, true)
    wrapper.unmount()
  })

  it('拖到卡片后方显示插入线，且不会冒泡为第二次网格移动', async () => {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    bookmarks.setViewFolder('10')
    const wrapper = mount(BookmarkGrid, { attachTo: document.body })
    const target = wrapper.findAllComponents(BookmarkCard).find((card) => card.props('node').id === '101')!
    const geometry = vi.spyOn(target.element, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 48, width: 100, height: 48, x: 0, y: 0, toJSON: () => ({}) })
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', '100')
    bookmarks.draggingId = '100'
    await target.trigger('dragover', { clientX: 90, dataTransfer })
    expect(target.attributes('data-drop-zone')).toBe('after')
    await target.trigger('drop', { clientX: 90, dataTransfer })
    await vi.waitFor(() => expect(bookmarks.currentChildren.map((node) => node.id)).toEqual(['101', '100', '102']))
    expect(chromeMock.bookmarks.move).toHaveBeenCalledTimes(1)
    expect(chromeMock.bookmarks.move).toHaveBeenCalledWith('100', { parentId: '10', index: 2 }, expect.any(Function))
    geometry.mockRestore()
    wrapper.unmount()
    bookmarks.dispose()
  })

  it('当前主页目录的右键菜单可恢复默认主页，并清除当前目录覆盖', async () => {
    const bookmarks = useBookmarksStore()
    const settings = useSettingsStore()
    await bookmarks.init()
    await settings.setHomeFolderId(devFolder.id)
    bookmarks.setViewFolder(devFolder.id)
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })

    await wrapper.trigger('contextmenu')
    const menuButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.glass-strong button'))
    const reset = menuButtons.find((button) => button.textContent?.trim() === '恢复默认主页')
    expect(reset).toBeDefined()
    expect(menuButtons.some((button) => button.textContent?.trim() === '设为主页')).toBe(false)
    reset!.click()

    await vi.waitFor(() => {
      expect(settings.homeFolderId).toBeNull()
      expect(chromeMock.__storage.sync.get('homeFolderId')).toBeNull()
      expect(bookmarks.viewFolderId).toBeNull()
      expect(bookmarks.currentFolder?.id).toBe('1')
    })
    wrapper.unmount()
    bookmarks.dispose()
  })

  it('其他目录仍可通过右键设为主页', async () => {
    const bookmarks = useBookmarksStore()
    const settings = useSettingsStore()
    await bookmarks.init()
    await settings.setHomeFolderId('2')
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })

    await wrapper.trigger('contextmenu')
    const menuButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.glass-strong button'))
    const setHome = menuButtons.find((button) => button.textContent?.trim() === '设为主页')
    expect(setHome).toBeDefined()
    expect(menuButtons.some((button) => button.textContent?.trim() === '恢复默认主页')).toBe(false)
    setHome!.click()

    await vi.waitFor(() => {
      expect(settings.homeFolderId).toBe(devFolder.id)
      expect(chromeMock.__storage.sync.get('homeFolderId')).toBe(devFolder.id)
      expect(bookmarks.currentFolder?.id).toBe(devFolder.id)
    })
    wrapper.unmount()
    bookmarks.dispose()
  })

  it('B3 右键文件夹 → 全部打开：收集嵌套书签 URL 并批量打开+分组', async () => {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('contextmenu')
    await nextTick()
    const openAllItem = Array.from(document.body.querySelectorAll('.glass-strong button')).find(
      (b) => b.textContent?.trim() === '全部打开',
    ) as HTMLElement
    openAllItem.click()
    await vi.waitFor(() => {
      expect(openAllInGroup).toHaveBeenCalledTimes(1)
      const [urls, title] = (openAllInGroup as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(urls).toEqual([
        'https://github.com',
        'https://developer.mozilla.org',
        'https://vuejs.org',
      ])
      expect(title).toBe('开发')
    })
    wrapper.unmount()
  })

  it('B2 右键书签 → 二维码：打开二维码对话框并渲染', async () => {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    // QrCodeDialog 消费 ui store，需一并挂载
    mount(QrCodeDialog, { attachTo: document.body })
    const wrapper = mount(BookmarkCard, { props: { node: github }, attachTo: document.body })
    await wrapper.trigger('contextmenu')
    await nextTick()
    const qrItem = Array.from(document.body.querySelectorAll('.glass-strong button')).find(
      (b) => b.textContent?.trim() === '二维码',
    ) as HTMLElement
    qrItem.click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('https://github.com')
    wrapper.unmount()
  })

  it('A4 拖拽书签到文件夹卡片 → 移入文件夹（chrome.bookmarks.move）', async () => {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    const settings = useSettingsStore()

    // 主视图切到书签栏，使 devFolder 与 github 同级可拖拽
    settings.homeFolderId = '1'
    bookmarks.setViewFolder('1')
    await nextTick()

    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    const dt = new DataTransfer()
    dt.setData('text/plain', '11') // Example 书签 → 拖到 开发 文件夹
    await wrapper.trigger('drop', { dataTransfer: dt, preventDefault: () => {} })

    await vi.waitFor(() => {
      expect(chromeMock.bookmarks.move).toHaveBeenCalledWith(
        '11',
        { parentId: '10', index: 0 },
        expect.any(Function),
      )
    })
    wrapper.unmount()
  })

  it('A4 拖拽进行中抑制悬停弹窗触发', async () => {
    vi.useFakeTimers()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('dragstart')
    expect((wrapper.vm as unknown as { dragging: boolean }).dragging).toBe(true)
    await wrapper.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(500)
    // 拖拽中不应弹出悬停面板（.glass-strong 的 fixed z-40）
    expect(document.body.querySelector('.glass-strong.fixed.z-40')).toBeNull()
    await wrapper.trigger('dragend')
    vi.useRealTimers()
    wrapper.unmount()
  })
})
