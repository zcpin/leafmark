import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isReactive } from 'vue'

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

  it('书签树作为不可变快照，不为嵌套节点建立深层代理', async () => {
    const store = useBookmarksStore()
    await store.init()

    expect(isReactive(store.tree[0])).toBe(false)
    expect(isReactive(store.tree[0]?.children?.[0])).toBe(false)
  })

  it('homeFolderId 优先于默认值', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('2')
    const store = useBookmarksStore()
    await store.init()
    expect(store.currentFolder?.id).toBe('2')
  })

  it.each(['missing-folder', '100'])('启动时主页不是可用目录则显示书签栏（%s）', async (homeId) => {
    chromeMock.__storage.sync.set('homeFolderId', homeId)
    const settings = useSettingsStore()
    const store = useBookmarksStore()
    await Promise.all([settings.init(), store.init()])

    expect(store.currentFolder?.id).toBe('1')
    expect(store.currentChildren.map((node) => node.id)).toEqual(['10', '11'])
    expect(store.breadcrumb.map((node) => node.id)).toEqual(['0', '1'])
    expect(settings.homeFolderId).toBe(homeId)
    settings.dispose()
    store.dispose()
  })

  it('原生管理器删除主页目录后，正在浏览的子目录自动退回书签栏', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('10')
    const store = useBookmarksStore()
    await store.init()
    store.setViewFolder('102')

    chromeMock.bookmarks.removeTree('10', () => {})

    await vi.waitFor(() => {
      expect(store.currentFolder?.id).toBe('1')
      expect(store.currentChildren.map((node) => node.id)).toEqual(['11'])
      expect(store.breadcrumb.map((node) => node.id)).toEqual(['0', '1'])
    })
    expect(settings.homeFolderId).toBe('10')
    store.dispose()
  })

  it('主页目录改名和移动后仍按原 id 打开', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('10')
    const store = useBookmarksStore()
    await store.init()

    await store.updateBookmark('10', { title: '工作资料' })
    await store.moveBookmark('10', '2', 0)

    expect(store.currentFolder?.id).toBe('10')
    expect(store.currentFolder?.title).toBe('工作资料')
    expect(store.breadcrumb.map((node) => node.id)).toEqual(['0', '2', '10'])
    store.dispose()
  })

  it('首次读取失败保留主页选择，重试成功后打开原目录', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('10')
    chromeMock.bookmarks.getTree.mockImplementationOnce((callback) => {
      chromeMock.runtime.lastError = { message: 'bookmarks unavailable' }
      callback([])
      chromeMock.runtime.lastError = null
    })
    const store = useBookmarksStore()
    await store.init()

    expect(store.error?.message).toBe('bookmarks unavailable')
    expect(settings.homeFolderId).toBe('10')
    await store.load()
    expect(store.currentFolder?.id).toBe('10')
    store.dispose()
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

  it('并发 load 合并为一次读取，并以最后一次快照为准', async () => {
    const callbacks: Array<(nodes: { id: string; title: string }[]) => void> = []
    const getTree = vi.spyOn(chromeMock.bookmarks, 'getTree')
    getTree.mockImplementation((cb) => {
      callbacks.push(cb as (nodes: { id: string; title: string }[]) => void)
    })

    try {
      const store = useBookmarksStore()
      const first = store.load()
      await new Promise((resolve) => setTimeout(resolve, 0))
      const second = store.load()

      expect(getTree).toHaveBeenCalledTimes(1)
      callbacks[0]?.([{ id: '0', title: 'old' }])
      await vi.waitFor(() => expect(getTree).toHaveBeenCalledTimes(2))
      callbacks[1]?.([{ id: '0', title: 'new' }])

      await Promise.all([first, second])
      expect(store.tree[0]?.title).toBe('new')
    } finally {
      getTree.mockRestore()
    }
  })

  it('写回及其触发的浏览器事件只产生一次刷新', async () => {
    const store = useBookmarksStore()
    await store.init()
    const readsAfterInit = chromeMock.bookmarks.getTree.mock.calls.length

    await store.updateBookmark('100', { title: '一次刷新' })

    expect(chromeMock.bookmarks.getTree).toHaveBeenCalledTimes(readsAfterInit + 1)
  })

  it('同一轮内的多个浏览器事件合并为一次刷新', async () => {
    const store = useBookmarksStore()
    await store.init()
    const readsAfterInit = chromeMock.bookmarks.getTree.mock.calls.length

    chromeMock.bookmarks.update('100', { title: '批量一' }, () => {})
    chromeMock.bookmarks.update('101', { title: '批量二' }, () => {})

    await vi.waitFor(() => {
      expect(store.tree[0]?.children?.[0]?.children?.[0]?.children?.[0]?.title).toBe('批量一')
      expect(store.tree[0]?.children?.[0]?.children?.[0]?.children?.[1]?.title).toBe('批量二')
    })
    expect(chromeMock.bookmarks.getTree).toHaveBeenCalledTimes(readsAfterInit + 1)
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
