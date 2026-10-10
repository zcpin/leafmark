import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { BIN_ITEM_LIMIT, BIN_BATCH_LIMIT } from '@/lib/deletion-bin'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useDeletionsStore } from '@/stores/deletions'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

beforeEach(() => {
  setActivePinia(createPinia())
  chromeMock.__reset()
})

function urlsInFolder(id: string): (string | undefined)[] {
  return (chromeMock.bookmarks.__find(id)?.children ?? []).map((node) => node.url)
}

/** 回收站里全部条目一起恢复（回收站没有「撤销一批」入口，只有按条恢复） */
function restoreAll(deletions: ReturnType<typeof useDeletionsStore>) {
  return deletions.restore(deletions.items.map((item) => item.id))
}

describe('删除恢复', () => {
  it('批量删除后按原顺序恢复；再恢复一次不重复创建', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([
      { id: '101', url: 'https://developer.mozilla.org' },
      { id: '100', url: 'https://github.com' },
    ])
    expect(deletions.count).toBe(2)
    await restoreAll(deletions)
    expect(chromeMock.bookmarks.__find('10')?.children?.map((node) => node.title)).toEqual([
      'GitHub',
      'MDN',
      '前端',
    ])
    expect(deletions.count).toBe(0)
    await restoreAll(deletions)
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(2)
    deletions.dispose()
  })

  it('本地记录在新页面中可恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    deletions.dispose()
    setActivePinia(createPinia())
    const reopened = useDeletionsStore()
    await reopened.init()
    expect(reopened.count).toBe(1)
    await restoreAll(reopened)
    expect(chromeMock.bookmarks.__find('10')?.children?.[0]?.url).toBe('https://github.com')
    reopened.dispose()
  })

  it('原目录不存在时恢复到书签栏', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    chromeMock.bookmarks.removeTree('10', () => {})
    await restoreAll(deletions)
    expect(
      chromeMock.bookmarks.__find('1')?.children?.some((node) => node.url === 'https://github.com'),
    ).toBe(true)
    deletions.dispose()
  })

  it('文件夹连同子目录恢复，并更新旧主页 id', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('102')
    await settings.setLinkCheckOptions({ folderId: '102' })
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '10' }])
    await restoreAll(deletions)
    const restored = chromeMock.bookmarks
      .__find('1')
      ?.children?.find((node) => node.title === '开发')
    expect(restored?.children?.map((node) => node.title)).toEqual(['GitHub', 'MDN', '前端'])
    expect(restored?.children?.[2]?.children?.[0]?.url).toBe('https://vuejs.org')
    expect(settings.homeFolderId).toBe(restored?.children?.[2]?.id)
    expect(settings.linkCheckOptions.folderId).toBe(restored?.children?.[2]?.id)
    deletions.dispose()
  })

  it('保存删除记录失败时禁止删除', async () => {
    const deletions = useDeletionsStore()
    await deletions.init()
    chromeMock.storage.local.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'quota exceeded' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await expect(deletions.remove([{ id: '100', url: 'https://github.com' }])).rejects.toThrow(
      'quota exceeded',
    )
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    deletions.dispose()
  })

  it('跳过 URL 已变更的旧结果', async () => {
    const deletions = useDeletionsStore()
    const result = await deletions.remove([{ id: '100', url: 'https://old.test' }])
    expect(result.skipped).toBe(1)
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    deletions.dispose()
  })

  it('部分恢复失败后重试，不重复创建已恢复项', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([
      { id: '100', url: 'https://github.com' },
      { id: '101', url: 'https://developer.mozilla.org' },
    ])
    chromeMock.bookmarks.create.mockImplementationOnce((_details, callback) => {
      chromeMock.runtime.lastError = { message: 'create failed' }
      callback({ id: '', title: '' })
      chromeMock.runtime.lastError = null
    })
    await restoreAll(deletions)
    expect(deletions.count).toBe(1)
    await restoreAll(deletions)
    expect(
      chromeMock.bookmarks.__find('10')?.children?.filter((node) => node.title === 'MDN'),
    ).toHaveLength(1)
    expect(useBookmarksStore().currentChildren.length).toBeGreaterThan(0)
    deletions.dispose()
  })

  it('两个新标签页同时恢复，只恢复一份书签', async () => {
    const firstPage = createPinia()
    const first = useDeletionsStore(firstPage)
    await first.remove([{ id: '100', url: 'https://github.com' }])
    const secondPage = createPinia()
    const second = useDeletionsStore(secondPage)
    await second.init()
    await Promise.all([restoreAll(first), restoreAll(second)])
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://github.com'),
    ).toHaveLength(1)
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(1)
    first.dispose()
    second.dispose()
    useSettingsStore(firstPage).dispose()
    useSettingsStore(secondPage).dispose()
    disposePinia(firstPage)
    disposePinia(secondPage)
  })

  it('创建成功但进度保存失败，新页面重试时核对已创建节点', async () => {
    const firstPage = createPinia()
    const first = useDeletionsStore(firstPage)
    await first.remove([{ id: '100', url: 'https://github.com' }])
    const write = chromeMock.storage.local.set.getMockImplementation()!
    let failed = false
    chromeMock.storage.local.set.mockImplementation((items, callback) => {
      if (!failed && chromeMock.bookmarks.create.mock.calls.length > 0) {
        failed = true
        chromeMock.runtime.lastError = { message: 'progress save failed' }
        callback()
        chromeMock.runtime.lastError = null
      } else write(items, callback)
    })
    await restoreAll(first)
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(1)
    chromeMock.storage.local.set.mockImplementation(write)
    first.dispose()
    useSettingsStore(firstPage).dispose()
    disposePinia(firstPage)

    const reopenedPage = createPinia()
    const reopened = useDeletionsStore(reopenedPage)
    await reopened.init()
    await restoreAll(reopened)
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://github.com'),
    ).toHaveLength(1)
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(1)
    expect(reopened.count).toBe(0)
    reopened.dispose()
    useSettingsStore(reopenedPage).dispose()
    disposePinia(reopenedPage)
  })

  it('不能保存恢复意图时不创建书签', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    chromeMock.storage.local.set.mockImplementationOnce((_items, callback) => {
      chromeMock.runtime.lastError = { message: 'storage unavailable' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await restoreAll(deletions)
    expect(chromeMock.bookmarks.create).not.toHaveBeenCalled()
    expect(deletions.count).toBe(1)
    deletions.dispose()
  })

  it('原本相同的两份书签部分恢复后，重试仍保留两份', async () => {
    chromeMock.bookmarks.update('101', { title: 'GitHub', url: 'https://github.com' }, () => {})
    const firstPage = createPinia()
    const first = useDeletionsStore(firstPage)
    await first.remove([
      { id: '100', url: 'https://github.com' },
      { id: '101', url: 'https://github.com' },
    ])
    chromeMock.bookmarks.create.mockImplementationOnce((_details, callback) => {
      chromeMock.runtime.lastError = { message: 'create failed' }
      callback({ id: '', title: '' })
      chromeMock.runtime.lastError = null
    })
    await restoreAll(first)
    expect(first.count).toBe(1)
    first.dispose()
    useSettingsStore(firstPage).dispose()
    disposePinia(firstPage)
    const nextPage = createPinia()
    const next = useDeletionsStore(nextPage)
    await next.init()
    await restoreAll(next)
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://github.com'),
    ).toHaveLength(2)
    expect(next.count).toBe(0)
    next.dispose()
    useSettingsStore(nextPage).dispose()
    disposePinia(nextPage)
  })

  it('回收站保留多批删除，可按条目分别恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    expect(deletions.depth).toBe(2)
    expect(deletions.count).toBe(2)

    await deletions.restore(['101'])
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    expect(urlsInFolder('10')).not.toContain('https://github.com')
    expect(deletions.depth).toBe(1)

    await deletions.restore(['100'])
    expect(urlsInFolder('10')).toEqual([
      'https://github.com',
      'https://developer.mozilla.org',
      undefined,
    ])
    expect(deletions.depth).toBe(0)
    expect(deletions.count).toBe(0)
    deletions.dispose()
  })

  it('记录在新页面中同样可按条目恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    deletions.dispose()
    setActivePinia(createPinia())
    const reopened = useDeletionsStore()
    await reopened.init()
    expect(reopened.depth).toBe(2)
    await reopened.restore(['100'])
    await reopened.restore(['101'])
    expect(urlsInFolder('10')).toContain('https://github.com')
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    reopened.dispose()
  })

  it('超过上限时丢弃最旧的记录', async () => {
    const total = BIN_BATCH_LIMIT + 2
    const children: BookmarkNode[] = Array.from({ length: total }, (_, i) => ({
      id: `b${i}`,
      title: `B${i}`,
      url: `https://b${i}.test`,
      parentId: '10',
    }))
    chromeMock.bookmarks.__setTree([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            parentId: '0',
            children: [{ id: '10', title: '开发', parentId: '1', children }],
          },
        ],
      },
    ])
    const deletions = useDeletionsStore()
    for (let i = 0; i < total; i++) {
      await deletions.remove([{ id: `b${i}`, url: `https://b${i}.test` }])
    }
    expect(deletions.depth).toBe(BIN_BATCH_LIMIT)
    await restoreAll(deletions)
    const urls = urlsInFolder('10')
    expect(urls).toHaveLength(BIN_BATCH_LIMIT)
    expect(urls).not.toContain('https://b0.test')
    expect(urls).not.toContain('https://b1.test')
    expect(urls).toContain('https://b2.test')
    expect(urls).toContain(`https://b${total - 1}.test`)
    deletions.dispose()
  })

  it('部分条目恢复失败时，其余条目照常恢复，失败的留在回收站重试', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([
      { id: '101', url: 'https://developer.mozilla.org' },
      { id: '11', url: 'https://example.com' },
    ])
    chromeMock.bookmarks.create.mockImplementationOnce((_details, callback) => {
      chromeMock.runtime.lastError = { message: 'create failed' }
      callback({ id: '', title: '' })
      chromeMock.runtime.lastError = null
    })
    await restoreAll(deletions)
    // 书签栏下那条创建失败；另外两条已恢复，失败项仍占着一批
    expect(urlsInFolder('10')).toContain('https://github.com')
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    expect(urlsInFolder('1')).not.toContain('https://example.com')
    expect(deletions.depth).toBe(1)
    expect(deletions.count).toBe(1)

    await restoreAll(deletions)
    expect(urlsInFolder('1')).toContain('https://example.com')
    expect(deletions.depth).toBe(0)
    expect(deletions.count).toBe(0)
    deletions.dispose()
  })

  it('1.x 的单条记录可迁移后可恢复', async () => {
    chromeMock.__storage.local.set('bookmarkUndo', {
      id: 'legacy',
      entries: [
        { parentId: '10', index: 0, node: { id: '900', title: 'Old', url: 'https://old.test' } },
      ],
    })
    const deletions = useDeletionsStore()
    await deletions.init()
    expect(deletions.depth).toBe(1)
    await restoreAll(deletions)
    expect(urlsInFolder('10')).toContain('https://old.test')
    deletions.dispose()
  })

  it('1.x 记录内嵌的 previous 迁移为更早的一批', async () => {
    chromeMock.__storage.local.set('bookmarkUndo', {
      id: 'legacy',
      entries: [
        { parentId: '10', index: 0, node: { id: '901', title: 'New', url: 'https://new.test' } },
      ],
      previous: [
        {
          parentId: '10',
          index: 1,
          node: { id: '902', title: 'Older', url: 'https://older.test' },
        },
      ],
    })
    const deletions = useDeletionsStore()
    await deletions.init()
    expect(deletions.depth).toBe(2)
    await restoreAll(deletions)
    await restoreAll(deletions)
    expect(urlsInFolder('10')).toContain('https://new.test')
    expect(urlsInFolder('10')).toContain('https://older.test')
    deletions.dispose()
  })

  it('写入配额不足时丢弃最旧的记录而不是放弃本次删除', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    const write = chromeMock.storage.local.set.getMockImplementation()!
    let dropped = false
    chromeMock.storage.local.set.mockImplementation((items, callback) => {
      const payload = items.bookmarkUndo as { records?: unknown[] } | null
      if (!dropped && (payload?.records?.length ?? 0) > 2) {
        dropped = true
        chromeMock.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }
        callback()
        chromeMock.runtime.lastError = null
        return
      }
      write(items, callback)
    })
    await deletions.remove([{ id: '11', url: 'https://example.com' }])
    chromeMock.storage.local.set.mockImplementation(write)
    expect(dropped).toBe(true)
    expect(deletions.depth).toBe(2)
    await restoreAll(deletions)
    await restoreAll(deletions)
    expect(urlsInFolder('1')).toContain('https://example.com')
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    expect(urlsInFolder('10')).not.toContain('https://github.com')
    deletions.dispose()
  })

  it('恢复与另一页面的删除串行执行，保留最新删除记录', async () => {
    const firstPage = createPinia()
    const first = useDeletionsStore(firstPage)
    await first.remove([{ id: '100', url: 'https://github.com' }])
    const secondPage = createPinia()
    const second = useDeletionsStore(secondPage)
    await second.init()
    await Promise.all([
      restoreAll(first),
      second.remove([{ id: '101', url: 'https://developer.mozilla.org' }]),
    ])
    expect(chromeMock.bookmarks.__find('101')).toBeUndefined()
    await restoreAll(second)
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://developer.mozilla.org'),
    ).toHaveLength(1)
    first.dispose()
    second.dispose()
    useSettingsStore(firstPage).dispose()
    useSettingsStore(secondPage).dispose()
    disposePinia(firstPage)
    disposePinia(secondPage)
  })
})

describe('回收站：按条目查看、恢复与清理', () => {
  it('条目带来源目录、删除时间与文件夹内书签数', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '102' }])
    const item = deletions.items[0]
    expect(item.isFolder).toBe(true)
    expect(item.count).toBe(1)
    expect(item.folder).toBe('开发')
    expect(item.deletedAt).toBeGreaterThan(0)
    deletions.dispose()
  })

  it('可以跨批次只恢复选中的那一条', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    await deletions.restore(['100'])
    expect(urlsInFolder('10')).toContain('https://github.com')
    expect(urlsInFolder('10')).not.toContain('https://developer.mozilla.org')
    expect(deletions.items.map((item) => item.id)).toEqual(['101'])
    deletions.dispose()
  })

  it('一批里只恢复部分条目时，其余条目仍在回收站', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([
      { id: '100', url: 'https://github.com' },
      { id: '101', url: 'https://developer.mozilla.org' },
    ])
    await deletions.restore(['101'])
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    expect(urlsInFolder('10')).not.toContain('https://github.com')
    expect(deletions.items.map((item) => item.id)).toEqual(['100'])
    deletions.dispose()
  })

  it('彻底删除后该条不再出现在回收站，也无法恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([
      { id: '100', url: 'https://github.com' },
      { id: '101', url: 'https://developer.mozilla.org' },
    ])
    await deletions.discard(['100'])
    expect(deletions.items.map((item) => item.id)).toEqual(['101'])
    await deletions.restore(['100'])
    expect(urlsInFolder('10')).not.toContain('https://github.com')
    deletions.dispose()
  })

  it('清空回收站后不保留任何条目', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    expect(deletions.count).toBe(2)
    await deletions.clear()
    expect(deletions.count).toBe(0)
    expect(deletions.items).toEqual([])
    deletions.dispose()
  })

  it('条目数超出上限时只保留最新的若干条', async () => {
    const total = BIN_ITEM_LIMIT + 5
    chromeMock.__storage.local.set('bookmarkUndo', {
      version: 2,
      records: [
        {
          id: 'new',
          entries: [
            {
              parentId: '10',
              index: 0,
              node: { id: 'newest', title: 'Newest', url: 'https://newest.test' },
              deletedAt: 1_000_000,
            },
          ],
        },
        {
          id: 'old',
          entries: Array.from({ length: total - 1 }, (_, i) => ({
            parentId: '10',
            index: 0,
            node: { id: `o${i}`, title: `O${i}`, url: `https://o${i}.test` },
            deletedAt: 1000 + i,
          })),
        },
      ],
    })
    const deletions = useDeletionsStore()
    await deletions.init()
    expect(deletions.items).toHaveLength(BIN_ITEM_LIMIT)
    expect(deletions.items[0].id).toBe('newest')
    deletions.dispose()
  })
})
