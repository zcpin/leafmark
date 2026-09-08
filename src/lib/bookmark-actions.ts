// BookmarkCard 右键命令的深 module：策略与视图/平台实现解耦
import { t } from './i18n'
import type { BookmarkNode } from './types'
import type { DeletionResult, DeletionTarget } from './bookmark-undo'

export type BookmarkActionKey =
  'openNew' | 'openCurrent' | 'openAll' | 'copy' | 'qr' | 'home' | 'resetHome' | 'edit' | 'delete'

export interface BookmarkActionSettings {
  openInNewTab: boolean
  setHomeFolderId(id: string | null): Promise<void>
}

export interface BookmarkActionBookmarks {
  collectFolderUrls(folderId: string): string[]
  setViewFolder(id: string): void
  resetHomeFolder(): Promise<void>
  updateBookmark(id: string, changes: { title?: string; url?: string }): Promise<void>
  removeBookmark(id: string, recursive?: boolean): Promise<void>
}

export interface BookmarkActionUi {
  toast(message: string): void
  openQr(url: string, title: string): Promise<void>
  openEdit(state: {
    id: string
    title: string
    url?: string
    isFolder: boolean
  }): Promise<{ title: string; url?: string } | null>
  confirm(options: { title: string; message: string }): Promise<boolean>
}

export interface BookmarkActionContext {
  node: BookmarkNode
  isFolder: boolean
  settings: BookmarkActionSettings
  bookmarks: BookmarkActionBookmarks
  ui: BookmarkActionUi
  openUrl(url: string, inNewTab: boolean): void
  openAllInGroup(urls: string[], groupTitle?: string): Promise<void>
  clipboard?: { writeText(text: string): Promise<void> }
  deleteBookmarks(targets: DeletionTarget[]): Promise<DeletionResult>
}

/** 执行一个右键命令；未知命令安全地 no-op。 */
export async function executeBookmarkAction(
  key: string,
  context: BookmarkActionContext,
): Promise<void> {
  const { node, isFolder, settings, bookmarks, ui } = context

  switch (key as BookmarkActionKey) {
    case 'openNew':
      if (node.url) context.openUrl(node.url, true)
      return
    case 'openCurrent':
      if (node.url) context.openUrl(node.url, false)
      return
    case 'openAll':
      if (isFolder) {
        await context.openAllInGroup(bookmarks.collectFolderUrls(node.id), node.title)
      }
      return
    case 'copy':
      try {
        if (!context.clipboard) throw new Error('clipboard unavailable')
        await context.clipboard.writeText(node.url ?? '')
        ui.toast(t('copied'))
      } catch {
        ui.toast(t('copyFailed'))
      }
      return
    case 'qr':
      if (node.url) await ui.openQr(node.url, node.title)
      return
    case 'home':
    case 'resetHome':
      if (!isFolder) return
      try {
        if (key === 'home') {
          await settings.setHomeFolderId(node.id)
          bookmarks.setViewFolder(node.id)
        } else {
          await bookmarks.resetHomeFolder()
        }
        ui.toast(t(key === 'home' ? 'homeSet' : 'homeReset'))
      } catch {
        ui.toast(t('homeSaveFailed'))
      }
      return
    case 'edit': {
      const result = await ui.openEdit({
        id: node.id,
        title: node.title,
        url: node.url,
        isFolder,
      })
      if (result) await bookmarks.updateBookmark(node.id, result)
      return
    }
    case 'delete': {
      const confirmed = await ui.confirm({
        title: isFolder ? t('deleteFolderTitle') : t('deleteBookmarkTitle'),
        message: isFolder ? t('deleteFolderMessage') : t('deleteBookmarkMessage'),
      })
      if (confirmed) {
        try {
          const result = await context.deleteBookmarks([{ id: node.id, url: node.url }])
          ui.toast(t('deleteUndoResult', { n: result.deleted.length, remaining: result.skipped + result.failed }))
        } catch {
          ui.toast(t('deleteUndoFailed'))
        }
      }
      return
    }
    default:
      return
  }
}
