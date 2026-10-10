// 书签卡片右键菜单的菜单项：纯数据构造，便于单测
// ContextMenu 的 MenuItem 只是编译期契约（type-only 导入，无运行时依赖）
import type { BookmarkActionKey } from './bookmark-actions'
import { t } from './i18n'
import type { MenuItem } from '@/components/ContextMenu.vue'

/** 'select' 由卡片自己处理，不进入 executeBookmarkAction */
export type CardMenuKey = BookmarkActionKey | 'select'

export interface CardMenuInput {
  isFolder: boolean
  /** 该文件夹已是主页目录 */
  isHomeFolder: boolean
  /** 默认打开方式；书签卡片据此显示反向的那一项 */
  openInNewTab: boolean
  /** 是否可参与批量移动（虚拟根等不可） */
  selectable: boolean
}

/** 文件夹：主页/取消主页、全部打开、编辑、[多选]、删除；书签：打开方式、复制、二维码、编辑、[多选]、删除 */
export function buildCardMenuItems(input: CardMenuInput): MenuItem<CardMenuKey>[] {
  const tail: MenuItem<CardMenuKey>[] = input.selectable
    ? [
        { key: 'select', label: t('multiSelect'), icon: 'select' },
        { key: 'delete', label: t('delete'), icon: 'trash', danger: true },
      ]
    : [{ key: 'delete', label: t('delete'), icon: 'trash', danger: true }]

  return input.isFolder
    ? [
        input.isHomeFolder
          ? { key: 'resetHome', label: t('resetHome'), icon: 'home' }
          : { key: 'home', label: t('setAsHome'), icon: 'home' },
        { key: 'openAll', label: t('openAll'), icon: 'externalLink' },
        { key: 'edit', label: t('edit'), icon: 'edit' },
        ...tail,
      ]
    : [
        input.openInNewTab
          ? { key: 'openCurrent', label: t('openInCurrentTab'), icon: 'externalLink' }
          : { key: 'openNew', label: t('openInNewTab'), icon: 'externalLink' },
        { key: 'copy', label: t('copyUrl'), icon: 'copy' },
        { key: 'qr', label: t('qrCode'), icon: 'externalLink' },
        { key: 'edit', label: t('edit'), icon: 'edit' },
        ...tail,
      ]
}
