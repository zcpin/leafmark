import { beforeEach, describe, expect, it } from 'vitest'

import { moveBookmarks, moveDestinationIssue } from '@/lib/bookmark-move'
import type { BookmarkNode } from '@/lib/types'
import { chromeMock } from '../mocks/chrome'

const tree: BookmarkNode[] = [{
  id: '0', title: '', children: [
    { id: '1', parentId: '0', title: 'Bar', children: [
      { id: 'a', parentId: '1', title: 'Alpha', url: 'https://a.test' },
      { id: 'b', parentId: '1', title: 'Beta', url: 'https://b.test' },
      { id: 'f', parentId: '1', title: 'Folder', children: [
        { id: 'child', parentId: 'f', title: 'Nested', children: [] },
      ] },
    ] },
    { id: '2', parentId: '0', title: 'Other', children: [
      { id: 'existing', parentId: '2', title: 'Existing', url: 'https://existing.test' },
    ] },
    { id: 'managed', parentId: '0', title: 'Managed', unmodifiable: 'managed', children: [
      { id: 'managed-child', parentId: 'managed', title: 'Child', children: [] },
    ] },
  ],
}]

beforeEach(() => chromeMock.bookmarks.__setTree(tree))

describe('批量移动书签', () => {
  it('依次追加并保留书签 id、文件夹子树和目标已有顺序', async () => {
    const result = await moveBookmarks([{ id: 'a', parentId: '1' }, { id: 'f', parentId: '1' }], '2')
    expect(result).toEqual({ moved: ['a', 'f'], skipped: [], failed: [] })
    expect(chromeMock.bookmarks.__find('1')?.children?.map((node) => node.id)).toEqual(['b'])
    expect(chromeMock.bookmarks.__find('2')?.children?.map((node) => node.id)).toEqual(['existing', 'a', 'f'])
    expect(chromeMock.bookmarks.__find('child')?.parentId).toBe('f')
    expect(chromeMock.bookmarks.create).not.toHaveBeenCalled()
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    expect(chromeMock.bookmarks.removeTree).not.toHaveBeenCalled()
  })

  it.each(['0', 'missing', 'a', 'f', 'child', 'managed', 'managed-child'])('整个批次在写入前拒绝无效或循环目标 %s', async (destination) => {
    await expect(moveBookmarks([{ id: 'a', parentId: '1' }, { id: 'f', parentId: '1' }], destination)).rejects.toThrow('Invalid move destination')
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('移动到原目录是空操作，重复的 id 也只处理一次', async () => {
    const targets = [{ id: 'a', parentId: '1' }, { id: 'a', parentId: '1' }]
    expect(await moveBookmarks(targets, '1')).toEqual({ moved: [], skipped: ['a'], failed: [] })
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
    expect(await moveBookmarks(targets, '2')).toEqual({ moved: ['a'], skipped: [], failed: [] })
    expect(chromeMock.bookmarks.move).toHaveBeenCalledTimes(1)
  })

  it('重新读取最新树，跳过已删除、移到别处和受保护的项目', async () => {
    chromeMock.bookmarks.move('a', { parentId: 'f' }, () => {})
    chromeMock.bookmarks.move.mockClear()
    const result = await moveBookmarks([
      { id: 'missing', parentId: '1' }, { id: 'a', parentId: '1' },
      { id: '1', parentId: '0' }, { id: 'managed', parentId: '0' },
      { id: 'managed-child', parentId: 'managed' }, { id: 'b', parentId: '1' },
    ], '2')
    expect(result).toEqual({ moved: ['b'], skipped: ['missing', 'a', '1', 'managed', 'managed-child'], failed: [] })
    expect(chromeMock.bookmarks.__find('a')?.parentId).toBe('f')
    expect(chromeMock.bookmarks.move).toHaveBeenCalledTimes(1)
  })

  it('单项 API 失败不阻塞后续项目，重试只需提交失败项', async () => {
    chromeMock.bookmarks.move.mockImplementationOnce((_id, _destination, callback) => {
      chromeMock.runtime.lastError = { message: 'temporarily unavailable' }
      callback(undefined as unknown as BookmarkNode)
      chromeMock.runtime.lastError = null
    })
    expect(await moveBookmarks([{ id: 'a', parentId: '1' }, { id: 'b', parentId: '1' }], '2'))
      .toEqual({ moved: ['b'], skipped: [], failed: ['a'] })
    expect(await moveBookmarks([{ id: 'a', parentId: '1' }], '2'))
      .toEqual({ moved: ['a'], skipped: [], failed: [] })
    expect(chromeMock.bookmarks.__find('2')?.children?.map((node) => node.id)).toEqual(['existing', 'b', 'a'])
  })

  it('无法获取新快照时不写入', async () => {
    chromeMock.bookmarks.getTree.mockImplementationOnce((callback) => {
      chromeMock.runtime.lastError = { message: 'read failed' }
      callback([])
      chromeMock.runtime.lastError = null
    })
    await expect(moveBookmarks([{ id: 'a', parentId: '1' }], '2')).rejects.toThrow('read failed')
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('两个页面同时提交同一批项目，后一个在锁内发现目录已改变并跳过', async () => {
    const targets = [{ id: 'a', parentId: '1' }, { id: 'b', parentId: '1' }]
    const results = await Promise.all([moveBookmarks(targets, '2'), moveBookmarks(targets, '2')])
    expect(results).toEqual([
      { moved: ['a', 'b'], skipped: [], failed: [] },
      { moved: [], skipped: ['a', 'b'], failed: [] },
    ])
    expect(chromeMock.bookmarks.move).toHaveBeenCalledTimes(2)
  })

  it('目标选择器能区分当前目录、循环目录和管理员目录', () => {
    const targets = [{ id: 'f', parentId: '1' }]
    expect(moveDestinationIssue(tree, targets, '1')).toBe('sameFolder')
    expect(moveDestinationIssue(tree, targets, 'child')).toBe('insideSelection')
    expect(moveDestinationIssue(tree, targets, 'managed-child')).toBe('unavailable')
    expect(moveDestinationIssue(tree, targets, '2')).toBeNull()
  })
})
