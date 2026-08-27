import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BookmarkCard from '@/components/BookmarkCard.vue'
import { openUrl } from '@/lib/tabs'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { SAMPLE_TREE, chromeMock } from '../mocks/chrome'
import { findNode } from '@/lib/tree-utils'

vi.mock('@/lib/tabs', () => ({ openUrl: vi.fn() }))

const github = findNode(SAMPLE_TREE, '100') as BookmarkNode
const devFolder = findNode(SAMPLE_TREE, '10') as BookmarkNode

describe('BookmarkCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('书签卡片：点击按 G5 设置打开（默认新标签页）', async () => {
    const settings = useSettingsStore()
    settings.openInNewTab = true
    const wrapper = mount(BookmarkCard, { props: { node: github }, attachTo: document.body })
    await wrapper.trigger('click')
    expect(openUrl).toHaveBeenCalledWith('https://github.com', true)
    wrapper.unmount()
  })

  it('书签卡片：openInNewTab=false 时当前页打开', async () => {
    const settings = useSettingsStore()
    settings.openInNewTab = false
    const wrapper = mount(BookmarkCard, { props: { node: github }, attachTo: document.body })
    await wrapper.trigger('click')
    expect(openUrl).toHaveBeenCalledWith('https://github.com', false)
    wrapper.unmount()
  })

  it('文件夹卡片：悬停 250ms 后弹出 A9 弹窗，内容为其直属子项', async () => {
    vi.useFakeTimers()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(249)
    expect(document.body.querySelector('.glass-strong')).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    const popup = document.body.querySelector('.glass-strong')
    expect(popup).not.toBeNull()
    expect(popup!.textContent).toContain('GitHub')
    expect(popup!.textContent).toContain('MDN')
    expect(popup!.textContent).toContain('前端')
    // 面板内页签与主页面卡片同款（.glass 卡片），且无滚动条
    expect(popup!.querySelectorAll('.glass').length).toBe(3)
    expect(popup!.className).not.toContain('overflow')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('文件夹卡片：移开 200ms 后弹窗收起，宽限期内移入保持', async () => {
    vi.useFakeTimers()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('mouseenter')
    vi.advanceTimersByTime(250)
    await wrapper.trigger('mouseleave')
    vi.advanceTimersByTime(150)
    // 模拟移入弹窗（弹窗自身的 mouseenter）
    const popup = document.body.querySelector('.glass-strong') as HTMLElement
    popup.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(1000)
    expect(document.body.querySelector('.glass-strong')).not.toBeNull()
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('A9 级联：面板内悬停子文件夹卡片 250ms 后展开下一层（同款网格面板）', async () => {
    vi.useFakeTimers()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(250)

    const popup = document.body.querySelector('.glass-strong') as HTMLElement
    const folderCard = Array.from(popup.querySelectorAll('.glass')).find((el) =>
      el.textContent?.includes('前端'),
    ) as HTMLElement
    expect(folderCard).toBeDefined()
    folderCard.dispatchEvent(new MouseEvent('mouseenter'))

    await vi.advanceTimersByTimeAsync(249)
    expect(document.body.querySelectorAll('.glass-strong').length).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    const panels = document.body.querySelectorAll('.glass-strong')
    expect(panels.length).toBe(2)
    expect(panels[1]!.textContent).toContain('Vue')
    // 级联面板内页签同样为主页面卡片样式
    expect(panels[1]!.querySelectorAll('.glass').length).toBe(1)

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('右键菜单：文件夹提供 设为主页/编辑/删除', async () => {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('contextmenu')
    await nextTick()
    const menu = document.body.querySelectorAll('.glass-strong button')
    const labels = Array.from(menu).map((b) => b.textContent?.trim())
    expect(labels).toContain('设为主页')
    expect(labels).toContain('编辑')
    expect(labels).toContain('删除')
    wrapper.unmount()
  })

  it('右键菜单：设为主页写入 settings 并切换主视图', async () => {
    const settings = useSettingsStore()
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    const wrapper = mount(BookmarkCard, { props: { node: devFolder }, attachTo: document.body })
    await wrapper.trigger('contextmenu')
    await nextTick()
    const homeItem = Array.from(document.body.querySelectorAll('.glass-strong button')).find(
      (b) => b.textContent?.trim() === '设为主页',
    ) as HTMLElement
    homeItem.click()
    await vi.waitFor(() => {
      expect(settings.homeFolderId).toBe('10')
      expect(chromeMock.__storage.sync.get('homeFolderId')).toBe('10')
      expect(bookmarks.currentFolder?.id).toBe('10')
    })
    wrapper.unmount()
  })

  it('书签卡片右键菜单：提供复制/编辑/删除', async () => {
    const wrapper = mount(BookmarkCard, { props: { node: github }, attachTo: document.body })
    await wrapper.trigger('contextmenu')
    await nextTick()
    const labels = Array.from(document.body.querySelectorAll('.glass-strong button')).map(
      (b) => b.textContent?.trim(),
    )
    expect(labels).toContain('复制链接')
    expect(labels).toContain('编辑')
    expect(labels).toContain('删除')
    wrapper.unmount()
  })
})
