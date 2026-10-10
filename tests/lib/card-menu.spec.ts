import { describe, expect, it } from 'vitest'

import { buildCardMenuItems, type CardMenuInput } from '@/lib/card-menu'
import { t } from '@/lib/i18n'

function keys(input: Partial<CardMenuInput>): string[] {
  return buildCardMenuItems({
    isFolder: false,
    isHomeFolder: false,
    openInNewTab: true,
    selectable: true,
    ...input,
  }).map((item) => item.key)
}

describe('buildCardMenuItems', () => {
  it('书签卡片：打开方式 / 复制 / 二维码 / 编辑 / 多选 / 删除', () => {
    expect(keys({ isFolder: false })).toEqual([
      'openCurrent',
      'copy',
      'qr',
      'edit',
      'select',
      'delete',
    ])
  })

  it('默认新标签打开时提供「在当前标签页打开」', () => {
    const items = buildCardMenuItems({
      isFolder: false,
      isHomeFolder: false,
      openInNewTab: true,
      selectable: true,
    })
    expect(items[0]!.label).toBe(t('openInCurrentTab'))
  })

  it('默认当前标签打开时提供「在新标签页打开」', () => {
    expect(keys({ isFolder: false, openInNewTab: false })[0]).toBe('openNew')
  })

  it('文件夹卡片：设为主页 / 全部打开 / 编辑 / 多选 / 删除', () => {
    expect(keys({ isFolder: true })).toEqual(['home', 'openAll', 'edit', 'select', 'delete'])
  })

  it('已是主页目录的文件夹改为提供「恢复默认主页」', () => {
    expect(keys({ isFolder: true, isHomeFolder: true })[0]).toBe('resetHome')
  })

  it('不可批量移动时不出现多选项', () => {
    expect(keys({ isFolder: true, selectable: false })).toEqual([
      'home',
      'openAll',
      'edit',
      'delete',
    ])
    expect(keys({ isFolder: false, selectable: false })).not.toContain('select')
  })

  it('删除项始终在最后且标记为危险操作', () => {
    for (const isFolder of [true, false]) {
      const items = buildCardMenuItems({
        isFolder,
        isHomeFolder: false,
        openInNewTab: true,
        selectable: true,
      })
      const last = items.at(-1)!
      expect(last.key).toBe('delete')
      expect(last.label).toBe(t('delete'))
      expect(last.danger).toBe(true)
    }
  })

  it('每一项都有图标，便于菜单左侧对齐', () => {
    const items = buildCardMenuItems({
      isFolder: true,
      isHomeFolder: false,
      openInNewTab: true,
      selectable: true,
    })
    expect(items.every((item) => typeof item.icon === 'string' && item.icon.length > 0)).toBe(true)
  })
})
