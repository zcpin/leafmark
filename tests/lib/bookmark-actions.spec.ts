import { describe, expect, it, vi } from 'vitest'

import {
  BATCH_OPEN_CONFIRM_THRESHOLD,
  executeBookmarkAction,
  type BookmarkActionContext,
  type BookmarkActionKey,
} from '@/lib/bookmark-actions'
import { MAX_BATCH_OPEN } from '@/lib/tabs'
import type { BookmarkNode } from '@/lib/types'

function makeContext(
  node: BookmarkNode,
  isFolder = false,
): BookmarkActionContext & {
  openUrl: ReturnType<typeof vi.fn>
  openAllInGroup: ReturnType<typeof vi.fn>
  clipboard: { writeText: ReturnType<typeof vi.fn> }
} {
  return {
    node,
    isFolder,
    settings: {
      openInNewTab: true,
      setHomeFolderId: vi.fn().mockResolvedValue(undefined),
    },
    bookmarks: {
      collectFolderUrls: vi.fn().mockReturnValue(['https://a.test']),
      setViewFolder: vi.fn(),
      resetHomeFolder: vi.fn().mockResolvedValue(undefined),
      updateBookmark: vi.fn().mockResolvedValue(undefined),
      removeBookmark: vi.fn().mockResolvedValue(undefined),
    },
    ui: {
      toast: vi.fn(),
      openQr: vi.fn().mockResolvedValue(undefined),
      openEdit: vi.fn().mockResolvedValue(null),
      confirm: vi.fn().mockResolvedValue(false),
    },
    openUrl: vi.fn(),
    openAllInGroup: vi.fn().mockResolvedValue(undefined),
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    deleteBookmarks: vi.fn().mockResolvedValue({ deleted: [node.id], skipped: 0, failed: 0 }),
  }
}

describe('bookmark-actions', () => {
  it('文件夹全部打开：收集 URL 后交给标签页 port', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)

    await executeBookmarkAction('openAll', context)

    expect(context.bookmarks.collectFolderUrls).toHaveBeenCalledWith('10')
    expect(context.openAllInGroup).toHaveBeenCalledWith(['https://a.test'], 'Dev')
  })

  it('超过阈值时先确认再打开，取消则不创建标签页', async () => {
    const urls = Array.from(
      { length: BATCH_OPEN_CONFIRM_THRESHOLD + 5 },
      (_, i) => `https://a.test/${i}`,
    )
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    context.bookmarks.collectFolderUrls.mockReturnValue(urls)
    context.ui.confirm.mockResolvedValueOnce(false)

    await executeBookmarkAction('openAll', context)

    expect(context.ui.confirm).toHaveBeenCalledOnce()
    expect(context.ui.confirm.mock.calls[0]![0]).toMatchObject({
      title: '打开全部书签',
      confirmText: '全部打开',
      tone: 'primary',
    })
    expect(context.ui.confirm.mock.calls[0]![0].message).toContain(String(urls.length))
    expect(context.openAllInGroup).not.toHaveBeenCalled()

    context.ui.confirm.mockResolvedValueOnce(true)
    await executeBookmarkAction('openAll', context)
    expect(context.openAllInGroup).toHaveBeenCalledWith(urls, 'Dev')
  })

  it('目录超过一次打开上限时提示上限，确认后仍交给标签页 port 截断', async () => {
    const urls = Array.from({ length: MAX_BATCH_OPEN + 10 }, (_, i) => `https://a.test/${i}`)
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    context.bookmarks.collectFolderUrls.mockReturnValue(urls)
    context.ui.confirm.mockResolvedValueOnce(true)

    await executeBookmarkAction('openAll', context)

    const options = context.ui.confirm.mock.calls[0]![0]
    expect(options.title).toBe('标签页数量超出上限')
    expect(options.message).toContain(String(urls.length))
    expect(options.message).toContain(String(MAX_BATCH_OPEN))
    expect(context.openAllInGroup).toHaveBeenCalledWith(urls, 'Dev')
  })

  it('空文件夹不确认也不打开', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    context.bookmarks.collectFolderUrls.mockReturnValue([])

    await executeBookmarkAction('openAll', context)

    expect(context.ui.confirm).not.toHaveBeenCalled()
    expect(context.openAllInGroup).not.toHaveBeenCalled()
  })

  it('书签复制失败时只显示失败提示', async () => {
    const context = makeContext({ id: '100', title: 'GitHub', url: 'https://github.com' })
    context.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))

    await executeBookmarkAction('copy', context)

    expect(context.ui.toast).toHaveBeenCalledWith('复制失败')
    expect(context.ui.toast).not.toHaveBeenCalledWith('链接已复制')
  })

  it('设为主页后同步主视图并提示用户', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)

    await executeBookmarkAction('home', context)

    expect(context.settings.setHomeFolderId).toHaveBeenCalledWith('10')
    expect(context.bookmarks.setViewFolder).toHaveBeenCalledWith('10')
    expect(context.ui.toast).toHaveBeenCalledWith('主页已更新')
  })

  it('确认删除后交给可撤销删除入口', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    context.ui.confirm.mockResolvedValueOnce(true)

    await executeBookmarkAction('delete', context)

    expect(context.deleteBookmarks).toHaveBeenCalledWith([{ id: '10', url: undefined }])
  })

  it('恢复默认主页后显示完成提示', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)

    await executeBookmarkAction('resetHome', context)

    expect(context.bookmarks.resetHomeFolder).toHaveBeenCalledOnce()
    expect(context.ui.toast).toHaveBeenCalledWith('已恢复默认主页')
  })

  it('未知命令不产生任何副作用（运行时兜底，类型层面已收紧）', async () => {
    const context = makeContext({ id: '10', title: 'Dev', url: 'https://a.test' })
    const spies = [
      context.openUrl,
      context.openAllInGroup,
      context.bookmarks.updateBookmark,
      context.deleteBookmarks,
      context.ui.toast,
    ]

    await executeBookmarkAction('bogus' as BookmarkActionKey, context)

    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it.each(['home', 'resetHome'] as const)(
    '主页操作 %s 保存失败时提示错误，不显示成功或切换目录',
    async (action) => {
      const context = makeContext({ id: '10', title: 'Dev' }, true)
      const save =
        action === 'home' ? context.settings.setHomeFolderId : context.bookmarks.resetHomeFolder
      vi.mocked(save).mockRejectedValueOnce(new Error('storage unavailable'))

      await executeBookmarkAction(action, context)

      expect(context.bookmarks.setViewFolder).not.toHaveBeenCalled()
      expect(context.ui.toast).toHaveBeenCalledExactlyOnceWith(
        '主页设置保存失败，已保留原设置，请重试。',
      )
    },
  )
})
