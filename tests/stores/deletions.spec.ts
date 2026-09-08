import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useBookmarksStore } from '@/stores/bookmarks'
import { useDeletionsStore } from '@/stores/deletions'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

beforeEach(() => { setActivePinia(createPinia()); chromeMock.__reset() })

describe('最近一次删除撤销', () => {
  it('批量删除后按原顺序恢复；撤销第二次不重复创建', async () => {
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '101', url: 'https://developer.mozilla.org' }, { id: '100', url: 'https://github.com' }])
    expect(deletions.undoCount).toBe(2)
    await deletions.undo()
    expect(chromeMock.bookmarks.__find('10')?.children?.map((node) => node.title)).toEqual(['GitHub', 'MDN', '前端'])
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
    expect(chromeMock.bookmarks.__find('1')?.children?.some((node) => node.url === 'https://github.com')).toBe(true)
    deletions.dispose()
  })

  it('文件夹连同子目录恢复，并更新旧主页 id', async () => {
    const settings = useSettingsStore()
    await settings.setHomeFolderId('102')
    await settings.setLinkCheckOptions({ folderId: '102' })
    const deletions = useDeletionsStore()
    await deletions.remove([{ id: '10' }])
    await deletions.undo()
    const restored = chromeMock.bookmarks.__find('1')?.children?.find((node) => node.title === '开发')
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
    await expect(deletions.remove([{ id: '100', url: 'https://github.com' }])).rejects.toThrow('quota exceeded')
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
    await deletions.remove([{ id: '100', url: 'https://github.com' }, { id: '101', url: 'https://developer.mozilla.org' }])
    chromeMock.bookmarks.create.mockImplementationOnce((_details, callback) => {
      chromeMock.runtime.lastError = { message: 'create failed' }
      callback({ id: '', title: '' })
      chromeMock.runtime.lastError = null
    })
    await deletions.undo()
    expect(deletions.undoCount).toBe(1)
    await deletions.undo()
    expect(chromeMock.bookmarks.__find('10')?.children?.filter((node) => node.title === 'MDN')).toHaveLength(1)
    expect(useBookmarksStore().currentChildren.length).toBeGreaterThan(0)
    deletions.dispose()
  })
})
