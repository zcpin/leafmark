import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecycleBinDialog from '@/components/RecycleBinDialog.vue'
import { t } from '@/lib/i18n'
import type { UndoEntry, UndoRecord } from '@/lib/bookmark-undo'
import { useDeletionsStore } from '@/stores/deletions'
import { useUiStore } from '@/stores/ui'
import { chromeMock } from '../mocks/chrome'

const wrappers: VueWrapper[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  chromeMock.__reset()
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

/** 回收站里的条目：url 为空表示文件夹 */
function entry(id: string, title: string, url: string, deletedAt: number): UndoEntry {
  return {
    parentId: '10',
    index: 0,
    node: { id, title, url },
    deletedAt,
    parentTitle: '开发',
  }
}

function folder(id: string, title: string, deletedAt: number): UndoEntry {
  return {
    parentId: '10',
    index: 0,
    node: { id, title, children: [{ id: `${id}-1`, title: '子书签', url: 'https://child.test' }] },
    deletedAt,
    parentTitle: '开发',
  }
}

function seed(records: UndoRecord[]) {
  chromeMock.__storage.local.set('bookmarkUndo', { version: 2, records })
}

async function openBin() {
  const deletions = useDeletionsStore()
  const ui = useUiStore()
  const wrapper = mount(RecycleBinDialog, { attachTo: document.body })
  wrappers.push(wrapper)
  await deletions.init()
  await deletions.refresh()
  deletions.showBin()
  await flushPromises()
  await flushPromises()
  return { deletions, ui }
}

function dialog(): HTMLElement {
  return document.querySelector<HTMLElement>('[role="dialog"]')!
}

function rows(): HTMLElement[] {
  return Array.from(dialog().querySelectorAll<HTMLElement>('li'))
}

function button(label: string, root: HTMLElement = dialog()): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.trim() === label,
  )
  if (!found) throw new Error(`button ${label} not found`)
  return found
}

describe('RecycleBinDialog', () => {
  it('展示每条的标题、网址与来源目录', async () => {
    seed([
      { id: 'a', entries: [entry('901', 'GitHub', 'https://deleted-a.test', 2000)] },
      { id: 'b', entries: [folder('902', '旧目录', 1000)] },
    ])
    const { deletions } = await openBin()
    expect(rows()).toHaveLength(2)
    expect(dialog().textContent).toContain('GitHub')
    expect(dialog().textContent).toContain('https://deleted-a.test')
    expect(dialog().textContent).toContain(t('recycleBinFrom', { folder: '开发' }))
    expect(deletions.items[0].id).toBe('901')
    expect(deletions.items[0].isFolder).toBe(false)
    expect(deletions.items[1].isFolder).toBe(true)
    expect(deletions.items[1].count).toBe(1)
  })

  it('只恢复点击的那一条，另一条留在回收站', async () => {
    seed([
      { id: 'a', entries: [entry('901', 'A', 'https://deleted-a.test', 2000)] },
      { id: 'b', entries: [entry('902', 'B', 'https://deleted-b.test', 1000)] },
    ])
    const { deletions } = await openBin()
    button(t('recycleBinRestore'), rows()[1]).click()
    await vi.waitFor(() => expect(deletions.items.map((item) => item.id)).toEqual(['901']))
    const urls = (chromeMock.bookmarks.__find('10')?.children ?? []).map((node) => node.url)
    expect(urls).toContain('https://deleted-b.test')
    expect(urls).not.toContain('https://deleted-a.test')
  })

  it('彻底删除需要二次确认，确认后不可再恢复', async () => {
    seed([{ id: 'a', entries: [entry('901', 'A', 'https://deleted-a.test', 2000)] }])
    const { deletions, ui } = await openBin()
    const confirm = vi.spyOn(ui, 'confirm').mockResolvedValue(false)
    button(t('recycleBinDiscard'), rows()[0]).click()
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled())
    await flushPromises()
    expect(deletions.items).toHaveLength(1)

    confirm.mockResolvedValue(true)
    button(t('recycleBinDiscard'), rows()[0]).click()
    await vi.waitFor(() => expect(deletions.items).toHaveLength(0))
    await flushPromises()
    expect(rows()).toHaveLength(0)
  })

  it('全部恢复后回收站清空，两条都回到原目录', async () => {
    seed([
      { id: 'a', entries: [entry('901', 'A', 'https://deleted-a.test', 2000)] },
      { id: 'b', entries: [entry('902', 'B', 'https://deleted-b.test', 1000)] },
    ])
    const { deletions } = await openBin()
    button(t('recycleBinRestoreAll')).click()
    await vi.waitFor(() => expect(deletions.items).toHaveLength(0))
    const urls = (chromeMock.bookmarks.__find('10')?.children ?? []).map((node) => node.url)
    expect(urls).toContain('https://deleted-a.test')
    expect(urls).toContain('https://deleted-b.test')
    expect(deletions.items).toHaveLength(0)
  })

  it('回收站为空时显示空态', async () => {
    await openBin()
    expect(rows()).toHaveLength(0)
    expect(dialog().textContent).toContain(t('recycleBinEmpty'))
  })
})
