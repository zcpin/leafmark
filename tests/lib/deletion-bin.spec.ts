import { describe, expect, it } from 'vitest'

import {
  binEntries,
  countBookmarks,
  deletionEntries,
  dropEntries,
  parseDeletionStack,
  pruneDeletionStack,
  BIN_ITEM_LIMIT,
  BIN_BATCH_LIMIT,
  type DeletedEntry,
  type DeletionRecord,
} from '@/lib/deletion-bin'
import type { BookmarkNode } from '@/lib/types'

function entry(id: string, parentId = '10', index = 0): DeletedEntry {
  return { parentId, index, node: { id, title: id, url: `https://${id}.test` } }
}

function record(id: string, entries: DeletedEntry[]): DeletionRecord {
  return { id, entries }
}

function tree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          parentId: '0',
          children: [
            {
              id: '10',
              title: '开发',
              parentId: '1',
              children: [
                { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '10' },
                { id: '101', title: 'MDN', url: 'https://developer.mozilla.org', parentId: '10' },
              ],
            },
          ],
        },
      ],
    },
  ]
}

describe('parseDeletionStack', () => {
  it('空值与非法值都得到空栈', () => {
    expect(parseDeletionStack(null)).toEqual([])
    expect(parseDeletionStack(undefined)).toEqual([])
    expect(parseDeletionStack('broken')).toEqual([])
    expect(parseDeletionStack({})).toEqual([])
    expect(parseDeletionStack({ records: 'nope' })).toEqual([])
  })

  it('读取新版栈并丢弃残缺记录', () => {
    const stack = parseDeletionStack({
      version: 2,
      records: [record('a', [entry('x')]), { id: 'b' }, record('c', [entry('y')])],
    })
    expect(stack.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('1.x 单条记录迁移为一条', () => {
    const stack = parseDeletionStack(record('legacy', [entry('x')]))
    expect(stack).toHaveLength(1)
    expect(stack[0].id).toBe('legacy')
  })

  it('1.x 记录内嵌的 previous 降级为更早的一条', () => {
    const legacy = {
      id: 'legacy',
      entries: [entry('x')],
      restoredIds: ['r1'],
      previous: [entry('y', '11', 1)],
      previousRestoredIds: ['r0'],
    }
    const stack = parseDeletionStack(legacy)
    expect(stack.map((item) => item.id)).toEqual(['legacy', 'legacy:previous'])
    expect(stack[1].restoredIds).toEqual(['r0'])
    expect(stack[1].entries[0].parentId).toBe('11')
  })

  it('超出上限时截断', () => {
    const records = Array.from({ length: BIN_BATCH_LIMIT + 3 }, (_, i) =>
      record(`r${i}`, [entry(`n${i}`)]),
    )
    const stack = parseDeletionStack({ version: 2, records })
    expect(stack).toHaveLength(BIN_BATCH_LIMIT)
    expect(stack[0].id).toBe('r0')
  })
})

describe('pruneDeletionStack', () => {
  it('丢弃空记录', () => {
    expect(
      pruneDeletionStack([record('a', []), record('b', [entry('x')])]).map((r) => r.id),
    ).toEqual(['b'])
  })

  it('条目总数超出上限时保留最新的条目', () => {
    const records = [
      record('new', [entry('n')]),
      record(
        'old',
        Array.from({ length: BIN_ITEM_LIMIT }, (_, i) => entry(`o${i}`)),
      ),
    ]
    const stack = pruneDeletionStack(records)
    expect(stack.reduce((sum, item) => sum + item.entries.length, 0)).toBe(BIN_ITEM_LIMIT)
    expect(stack[0].id).toBe('new')
    expect(stack[0].entries).toHaveLength(1)
  })
})

describe('binEntries', () => {
  it('展平为条目，最新在前，并带上所属批次与删除时间', () => {
    const records = [
      record('a', [{ ...entry('x'), deletedAt: 2000 }]),
      record('b', [
        { ...entry('y'), deletedAt: 1000 },
        { ...entry('z'), deletedAt: 3000 },
      ]),
    ]
    const items = binEntries(records)
    expect(items.map((item) => item.node.id)).toEqual(['z', 'x', 'y'])
    expect(items.map((item) => item.recordId)).toEqual(['b', 'a', 'b'])
  })

  it('缺少删除时间时回退到批次时间', () => {
    const items = binEntries([record('1700000000000-1', [entry('x')])])
    expect(items[0].deletedAt).toBe(1_700_000_000_000)
  })
})

describe('dropEntries', () => {
  it('按节点 id 移除条目，整批清空时丢掉该批', () => {
    const records = [record('a', [entry('x')]), record('b', [entry('y'), entry('z')])]
    const kept = dropEntries(records, new Set(['x', 'y']))
    expect(kept.map((item) => item.id)).toEqual(['b'])
    expect(kept[0].entries.map((item) => item.node.id)).toEqual(['z'])
  })

  it('没有命中时原样返回', () => {
    const records = [record('a', [entry('x')])]
    expect(dropEntries(records, new Set(['nope']))).toEqual(records)
  })
})

describe('countBookmarks', () => {
  it('统计子树内的书签数量', () => {
    expect(countBookmarks({ id: '1', title: 'a', url: 'https://a.test' })).toBe(1)
    expect(
      countBookmarks({
        id: '2',
        title: 'f',
        children: [
          { id: '3', title: 'b', url: 'https://b.test' },
          {
            id: '4',
            title: 'g',
            children: [
              { id: '5', title: 'c', url: 'https://c.test' },
              { id: '6', title: 'd', url: 'https://d.test' },
            ],
          },
        ],
      }),
    ).toBe(3)
  })
})

describe('deletionEntries', () => {
  it('子项与父文件夹同时选中时只保存父项', () => {
    const entries = deletionEntries(tree(), [
      { id: '10' },
      { id: '100', url: 'https://github.com' },
    ])
    expect(entries.map((item) => item.node.id)).toEqual(['10'])
    expect(entries[0].node.children?.map((child) => child.id)).toEqual(['100', '101'])
  })

  it('URL 已变化的目标被跳过，虚拟根下的节点不入栈', () => {
    expect(deletionEntries(tree(), [{ id: '100', url: 'https://old.test' }])).toEqual([])
    expect(deletionEntries(tree(), [{ id: '1' }])).toEqual([])
  })
})
