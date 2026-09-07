import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useBookmarksStore } from '@/stores/bookmarks'
import { useStatsStore } from '@/stores/stats'
import { chromeMock } from '../mocks/chrome'

describe('stats store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('统计示例树中的所有嵌套书签，不计文件夹', async () => {
    const bookmarks = useBookmarksStore()
    const stats = useStatsStore()
    await bookmarks.init()

    expect(stats.total).toBe(4)
  })

  it('书签快照替换后统计会更新', async () => {
    const bookmarks = useBookmarksStore()
    const stats = useStatsStore()
    await bookmarks.init()

    chromeMock.bookmarks.__setTree([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'Folder',
            children: [{ id: '2', title: 'Only', url: 'https://only.test' }],
          },
        ],
      },
    ])
    await bookmarks.load()
    expect(stats.total).toBe(1)

    chromeMock.bookmarks.__setTree([])
    await bookmarks.load()
    expect(stats.total).toBe(0)
  })
})
