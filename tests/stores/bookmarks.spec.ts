import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

describe('bookmarks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('init 加载书签树', async () => {
    const store = useBookmarksStore()
    await store.init()
    expect(store.tree[0]?.id).toBe('0')
    expect(store.loading).toBe(false)
  })

  it('主视图默认：homeFolderId → 无则书签栏(id=1)', async () => {
    const store = useBookmarksStore()
    await store.init()
    expect(store.currentFolder?.id).toBe('1')
    expect(store.currentChildren.map((c) => c.id)).toEqual(['10', '11'])
  })

  it('homeFolderId 优先于默认值', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('2')
    const store = useBookmarksStore()
    await store.init()
    expect(store.currentFolder?.id).toBe('2')
  })

  it('setViewFolder 切换主视图（A5 侧栏树）', async () => {
    const store = useBookmarksStore()
    await store.init()
    store.setViewFolder('10')
    expect(store.currentChildren.map((c) => c.id)).toEqual(['100', '101', '102'])
  })

  it('breadcrumb 返回从根到当前视图的路径（A6）', async () => {
    const store = useBookmarksStore()
    await store.init()
    store.setViewFolder('1020')
    expect(store.breadcrumb.map((n) => n.id)).toEqual(['0', '1', '10', '102', '1020'])
  })

  it('外部书签事件触发自动刷新（监听 chrome.bookmarks 四类事件）', async () => {
    const store = useBookmarksStore()
    await store.init()

    // 模拟浏览器原生书签管理器中的修改（store 外部变更，含事件发射）
    chromeMock.bookmarks.update('100', { title: 'GH' }, () => {})
    await vi.waitFor(() => {
      expect(store.tree[0]?.children?.[0]?.children?.[0]?.children?.[0]?.title).toBe('GH')
    })
  })

  it('updateBookmark 写回真实书签树', async () => {
    const store = useBookmarksStore()
    await store.init()
    await store.updateBookmark('100', { title: 'GitHub Main' })
    expect(chromeMock.bookmarks.update).toHaveBeenCalledWith(
      '100',
      { title: 'GitHub Main' },
      expect.any(Function),
    )
    expect(chromeMock.bookmarks.__find('100')?.title).toBe('GitHub Main')
  })

  it('removeBookmark 书签用 remove、文件夹用 removeTree', async () => {
    const store = useBookmarksStore()
    await store.init()
    await store.removeBookmark('11')
    expect(chromeMock.bookmarks.remove).toHaveBeenCalledWith('11', expect.any(Function))
    await store.removeBookmark('10', true)
    expect(chromeMock.bookmarks.removeTree).toHaveBeenCalledWith('10', expect.any(Function))
  })
})
