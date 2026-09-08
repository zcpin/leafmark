import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useDeletionsStore } from '@/stores/deletions'
import { useDuplicatesStore } from '@/stores/duplicates'
import { useUiStore } from '@/stores/ui'
import { chromeMock } from '../mocks/chrome'

const url = 'https://example.com/page?x=1#anchor'
beforeEach(async () => {
  setActivePinia(createPinia())
  chromeMock.__reset()
  chromeMock.bookmarks.__setTree([{ id: '0', title: '', children: [
    { id: '1', parentId: '0', title: '书签栏', children: [{ id: '100', parentId: '1', title: 'A', url }] },
    { id: '2', parentId: '0', title: '其他书签', children: [
      { id: '200', parentId: '2', title: 'B', url },
      { id: '201', parentId: '2', title: 'Different hash', url: 'https://example.com/page?x=1#other' },
      { id: '202', parentId: '2', title: 'Different query', url: 'https://example.com/page?x=2#anchor' },
    ] },
  ] }])
  await useBookmarksStore().load()
})

describe('重复书签检测', () => {
  it('仅按完整 URL 分组，并展示不同目录', () => {
    const store = useDuplicatesStore()
    expect(store.groups).toHaveLength(1)
    expect(store.groups[0]?.links.map((link) => link.folder)).toEqual(['书签栏', '其他书签'])
    expect(store.extraCount).toBe(1)
    expect(store.selected).toEqual([])
  })

  it('每组最后一个保留项不可选；即使程序选中全部也禁止删除', async () => {
    const store = useDuplicatesStore()
    const group = store.groups[0]!
    store.toggle(group.links[0]!, true)
    expect(store.canSelect(group.links[1]!, group)).toBe(false)
    store.toggle(group.links[1]!, true)
    expect(store.validSelection).toBe(false)
    await store.deleteSelected()
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
  })

  it('删除所选副本，并可撤销恢复原目录', async () => {
    const store = useDuplicatesStore()
    store.toggle(store.groups[0]!.links[1]!, true)
    vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)
    await store.deleteSelected()
    expect(chromeMock.bookmarks.__find('100')).toBeDefined()
    expect(chromeMock.bookmarks.__find('200')).toBeUndefined()
    expect(store.groups).toHaveLength(0)
    await useDeletionsStore().undo()
    expect(store.groups[0]?.links).toHaveLength(2)
    expect(chromeMock.bookmarks.__find('2')?.children?.[0]?.title).toBe('B')
    useDeletionsStore().dispose()
  })

  it('确认期间保留副本被删除，会阻止删除最后一个副本', async () => {
    const store = useDuplicatesStore()
    store.toggle(store.groups[0]!.links[0]!, true)
    vi.spyOn(useUiStore(), 'confirm').mockImplementation(async () => {
      chromeMock.bookmarks.remove('200', () => {})
      return true
    })
    await store.deleteSelected()
    expect(chromeMock.bookmarks.__find('100')).toBeDefined()
    expect(chromeMock.bookmarks.remove).toHaveBeenCalledTimes(1)
    expect(store.error).toBeTruthy()
    useDeletionsStore().dispose()
  })

  it('被勾选书签的网址改变后，旧选择不会应用到新网址', async () => {
    const store = useDuplicatesStore()
    store.toggle(store.groups[0]!.links[0]!, true)
    await useBookmarksStore().updateBookmark('100', { url: 'https://changed.test' })
    expect(store.selected).toHaveLength(0)
    await store.deleteSelected()
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
  })
})
