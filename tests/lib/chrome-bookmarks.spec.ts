import { describe, expect, it, vi } from 'vitest'

import {
  getChildren,
  getTree,
  moveBookmark,
  onBookmarksChanged,
  removeBookmark,
  updateBookmark,
} from '@/lib/chrome-bookmarks'
import { chromeMock } from '../mocks/chrome'

describe('chrome-bookmarks', () => {
  it('getTree 返回书签树', async () => {
    const tree = await getTree()
    expect(tree[0]?.id).toBe('0')
  })

  it('getChildren 返回直属子节点', async () => {
    const children = await getChildren('1')
    expect(children.map((c) => c.id)).toEqual(['10', '11'])
  })

  it('updateBookmark 修改标题', async () => {
    const node = await updateBookmark('100', { title: 'GH' })
    expect(node.title).toBe('GH')
    expect(chromeMock.bookmarks.__find('100')?.title).toBe('GH')
  })

  it('removeBookmark 删除书签节点', async () => {
    await removeBookmark('11')
    expect(chromeMock.bookmarks.__find('11')).toBeUndefined()
    expect(chromeMock.bookmarks.remove).toHaveBeenCalledWith('11', expect.any(Function))
  })

  it('removeBookmark 递归模式调用 removeTree 删除文件夹', async () => {
    await removeBookmark('10', true)
    expect(chromeMock.bookmarks.removeTree).toHaveBeenCalledWith('10', expect.any(Function))
    expect(chromeMock.bookmarks.__find('100')).toBeUndefined()
  })

  it('moveBookmark 移动节点到新位置', async () => {
    await moveBookmark('11', { parentId: '10', index: 0 })
    expect(chromeMock.bookmarks.__find('10')?.children?.map((c) => c.id)).toEqual(['11', '100', '101', '102'])
  })

  it('onBookmarksChanged 聚合四类书签事件', async () => {
    const spy = vi.fn()
    const off = onBookmarksChanged(spy)
    await updateBookmark('100', { title: 'x' })
    await removeBookmark('11')
    await moveBookmark('100', { parentId: '2' })
    expect(spy).toHaveBeenCalledTimes(3)
    off()
  })

  it('取消订阅后事件不再触发', async () => {
    const spy = vi.fn()
    const off = onBookmarksChanged(spy)
    off()
    await updateBookmark('100', { title: 'x' })
    expect(spy).not.toHaveBeenCalled()
  })
})
