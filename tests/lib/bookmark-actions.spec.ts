import { describe, expect, it, vi } from 'vitest'

import { executeBookmarkAction, type BookmarkActionContext } from '@/lib/bookmark-actions'
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
  }
}

describe('bookmark-actions', () => {
  it('文件夹全部打开：收集 URL 后交给标签页 port', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)

    await executeBookmarkAction('openAll', context)

    expect(context.bookmarks.collectFolderUrls).toHaveBeenCalledWith('10')
    expect(context.openAllInGroup).toHaveBeenCalledWith(['https://a.test'], 'Dev')
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

  it('确认删除文件夹时使用递归删除', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    context.ui.confirm.mockResolvedValueOnce(true)

    await executeBookmarkAction('delete', context)

    expect(context.bookmarks.removeBookmark).toHaveBeenCalledWith('10', true)
  })

  it('恢复默认主页后显示完成提示', async () => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)

    await executeBookmarkAction('resetHome', context)

    expect(context.bookmarks.resetHomeFolder).toHaveBeenCalledOnce()
    expect(context.ui.toast).toHaveBeenCalledWith('已恢复默认主页')
  })

  it.each(['home', 'resetHome'])('主页操作 %s 保存失败时提示错误，不显示成功或切换目录', async (action) => {
    const context = makeContext({ id: '10', title: 'Dev' }, true)
    const save = action === 'home'
      ? context.settings.setHomeFolderId
      : context.bookmarks.resetHomeFolder
    vi.mocked(save).mockRejectedValueOnce(new Error('storage unavailable'))

    await executeBookmarkAction(action, context)

    expect(context.bookmarks.setViewFolder).not.toHaveBeenCalled()
    expect(context.ui.toast).toHaveBeenCalledExactlyOnceWith('主页设置保存失败，已保留原设置，请重试。')
  })
})
