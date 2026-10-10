// BookmarkCard 右键命令的深 module：策略与视图/平台实现解耦
import { t } from './i18n'
import { MAX_BATCH_OPEN } from './tabs'
import type { BookmarkNode } from './types'
import type { DeletionResult, DeletionTarget } from './bookmark-undo'

/** 超过该数量时「全部打开」先向用户确认，避免误触发大量标签页。 */
export const BATCH_OPEN_CONFIRM_THRESHOLD = 15

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

export interface BookmarkActionConfirm {
  title: string
  message: string
  confirmText?: string
  /** danger 显示删除样式；primary 用于非破坏性确认（如批量打开）。 */
  tone?: 'danger' | 'primary'
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
  confirm(options: BookmarkActionConfirm): Promise<boolean>
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

/**
 * 执行一个右键命令。
 * key 由 BookmarkActionKey 收紧：拼写错误在编译期暴露；default 分支只做穷尽性检查。
 */
export async function executeBookmarkAction(
  key: BookmarkActionKey,
  context: BookmarkActionContext,
): Promise<void> {
  const { node, isFolder, settings, bookmarks, ui } = context

  switch (key) {
    case 'openNew':
      if (node.url) context.openUrl(node.url, true)
      return
    case 'openCurrent':
      if (node.url) context.openUrl(node.url, false)
      return
    case 'openAll': {
      if (!isFolder) return
      const urls = bookmarks.collectFolderUrls(node.id)
      if (urls.length === 0) return
      // 大目录会一次性创建大量标签页，先确认再打开
      if (urls.length > BATCH_OPEN_CONFIRM_THRESHOLD) {
        const confirmed = await ui.confirm(
          urls.length > MAX_BATCH_OPEN
            ? {
                title: t('openAllLimitTitle'),
                message: t('openAllLimitMessage', { n: urls.length, limit: MAX_BATCH_OPEN }),
                confirmText: t('openAll'),
                tone: 'primary',
              }
            : {
                title: t('openAllConfirmTitle'),
                message: t('openAllConfirmMessage', { n: urls.length }),
                confirmText: t('openAll'),
                tone: 'primary',
              },
        )
        if (!confirmed) return
      }
      await context.openAllInGroup(urls, node.title)
      return
    }
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
          ui.toast(
            t('deleteUndoResult', {
              n: result.deleted.length,
              remaining: result.skipped + result.failed,
            }),
          )
        } catch {
          ui.toast(t('deleteUndoFailed'))
        }
      }
      return
    }
    default: {
      // 新增 BookmarkActionKey 成员却漏写分支时，此处会报类型错误
      const unreachable: never = key
      return unreachable
    }
  }
}
