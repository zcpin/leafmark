import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { UNDO_STACK_LIMIT } from '@/lib/bookmark-undo'
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

describe('最近一次删除撤销', () => {
  it('批量删除后按原顺序恢复；撤销第二次不重复创建', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([
      { id: '101', url: 'https://developer.mozilla.org' },
      { id: '100', url: 'https://github.com' },
    ])
    expect(deletions.undoCount).toBe(2)
    await deletions.undo()
    expect(chromeMock.bookmarks.__find('10')?.children?.map((node) => node.title)).toEqual([
      'GitHub',
      'MDN',
      '前端',
    ])
    expect(deletions.undoCount).toBe(0)
    await deletions.undo()
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
    expect(reopened.undoCount).toBe(1)
    await reopened.undo()
    expect(chromeMock.bookmarks.__find('10')?.children?.[0]?.url).toBe('https://github.com')
    reopened.dispose()
  })

  it('原目录不存在时恢复到书签栏', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    chromeMock.bookmarks.removeTree('10', () => {})
    await deletions.undo()
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
    await deletions.undo()
    const restored = chromeMock.bookmarks
      .__find('1')
      ?.children?.find((node) => node.title === '开发')
    expect(restored?.children?.map((node) => node.title)).toEqual(['GitHub', 'MDN', '前端'])
    expect(restored?.children?.[2]?.children?.[0]?.url).toBe('https://vuejs.org')
    expect(settings.homeFolderId).toBe(restored?.children?.[2]?.id)
    expect(settings.linkCheckOptions.folderId).toBe(restored?.children?.[2]?.id)
    deletions.dispose()
  })

  it('保存撤销记录失败时禁止删除', async () => {
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
    await deletions.undo()
    expect(deletions.undoCount).toBe(1)
    await deletions.undo()
    expect(
      chromeMock.bookmarks.__find('10')?.children?.filter((node) => node.title === 'MDN'),
    ).toHaveLength(1)
    expect(useBookmarksStore().currentChildren.length).toBeGreaterThan(0)
    deletions.dispose()
  })

  it('两个新标签页同时撤销，只恢复一份书签', async () => {
    const firstPage = createPinia()
    const first = useDeletionsStore(firstPage)
    await first.remove([{ id: '100', url: 'https://github.com' }])
    const secondPage = createPinia()
    const second = useDeletionsStore(secondPage)
    await second.init()
    await Promise.all([first.undo(), second.undo()])
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
    await first.undo()
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(1)
    chromeMock.storage.local.set.mockImplementation(write)
    first.dispose()
    useSettingsStore(firstPage).dispose()
    disposePinia(firstPage)

    const reopenedPage = createPinia()
    const reopened = useDeletionsStore(reopenedPage)
    await reopened.init()
    await reopened.undo()
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://github.com'),
    ).toHaveLength(1)
    expect(chromeMock.bookmarks.create).toHaveBeenCalledTimes(1)
    expect(reopened.undoCount).toBe(0)
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
    await deletions.undo()
    expect(chromeMock.bookmarks.create).not.toHaveBeenCalled()
    expect(deletions.undoCount).toBe(1)
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
    await first.undo()
    expect(first.undoCount).toBe(1)
    first.dispose()
    useSettingsStore(firstPage).dispose()
    disposePinia(firstPage)
    const nextPage = createPinia()
    const next = useDeletionsStore(nextPage)
    await next.init()
    await next.undo()
    expect(
      chromeMock.bookmarks
        .__find('10')
        ?.children?.filter((node) => node.url === 'https://github.com'),
    ).toHaveLength(2)
    expect(next.undoCount).toBe(0)
    next.dispose()
    useSettingsStore(nextPage).dispose()
    disposePinia(nextPage)
  })

  it('撤销栈跨页面保留多批删除，按后进先出逐批恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    expect(deletions.undoDepth).toBe(2)
    expect(deletions.undoCount).toBe(1)

    await deletions.undo()
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    expect(urlsInFolder('10')).not.toContain('https://github.com')
    expect(deletions.undoDepth).toBe(1)

    await deletions.undo()
    expect(urlsInFolder('10')).toEqual([
      'https://github.com',
      'https://developer.mozilla.org',
      undefined,
    ])
    expect(deletions.undoDepth).toBe(0)
    expect(deletions.undoCount).toBe(0)
    deletions.dispose()
  })

  it('记录在新页面中同样可逐批恢复', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '100', url: 'https://github.com' }])
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }])
    deletions.dispose()
    setActivePinia(createPinia())
    const reopened = useDeletionsStore()
    await reopened.init()
    expect(reopened.undoDepth).toBe(2)
    await reopened.undo()
    await reopened.undo()
    expect(urlsInFolder('10')).toContain('https://github.com')
    expect(urlsInFolder('10')).toContain('https://developer.mozilla.org')
    reopened.dispose()
  })

  it('超过上限时丢弃最旧的记录', async () => {
    const total = UNDO_STACK_LIMIT + 2
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
    expect(deletions.undoDepth).toBe(UNDO_STACK_LIMIT)
    for (let i = 0; i < UNDO_STACK_LIMIT; i++) await deletions.undo()
    const urls = urlsInFolder('10')
    expect(urls).toHaveLength(UNDO_STACK_LIMIT)
    expect(urls).not.toContain('https://b0.test')
    expect(urls).not.toContain('https://b1.test')
    expect(urls).toContain('https://b2.test')
    expect(urls).toContain(`https://b${total - 1}.test`)
    deletions.dispose()
  })

  it('本批部分失败时保留剩余项，更早的批次仍在栈中', async () => {
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
    await deletions.undo()
    expect(deletions.undoDepth).toBe(2)
    expect(deletions.undoCount).toBe(1)
    await deletions.undo()
    expect(deletions.undoDepth).toBe(1)
    await deletions.undo()
    expect(urlsInFolder('1')).toContain('https://example.com')
    expect(urlsInFolder('10')).toContain('https://github.com')
    expect(deletions.undoDepth).toBe(0)
    deletions.dispose()
  })

  it('1.x 的单条记录可迁移并按新版栈撤销', async () => {
    chromeMock.__storage.local.set('bookmarkUndo', {
      id: 'legacy',
      entries: [
        { parentId: '10', index: 0, node: { id: '900', title: 'Old', url: 'https://old.test' } },
      ],
    })
    const deletions = useDeletionsStore()
    await deletions.init()
    expect(deletions.undoDepth).toBe(1)
    await deletions.undo()
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
    expect(deletions.undoDepth).toBe(2)
    await deletions.undo()
    await deletions.undo()
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
    expect(deletions.undoDepth).toBe(2)
    await deletions.undo()
    await deletions.undo()
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
      first.undo(),
      second.remove([{ id: '101', url: 'https://developer.mozilla.org' }]),
    ])
    expect(chromeMock.bookmarks.__find('101')).toBeUndefined()
    await second.undo()
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
