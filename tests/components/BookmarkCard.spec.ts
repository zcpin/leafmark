import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BookmarkCard from '@/components/BookmarkCard.vue'
import QrCodeDialog from '@/components/QrCodeDialog.vue'
import { openAllInGroup } from '@/lib/tabs'
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
