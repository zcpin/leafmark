import { describe, expect, it } from 'vitest'

import {
  deletionEntries,
  parseUndoStack,
  pruneUndoStack,
  UNDO_STACK_LIMIT,
  type UndoEntry,
  type UndoRecord,
} from '@/lib/bookmark-undo'
import type { BookmarkNode } from '@/lib/types'

function entry(id: string, parentId = '10', index = 0): UndoEntry {
  return { parentId, index, node: { id, title: id, url: `https://${id}.test` } }
}

function record(id: string, entries: UndoEntry[]): UndoRecord {
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

describe('parseUndoStack', () => {
  it('空值与非法值都得到空栈', () => {
    expect(parseUndoStack(null)).toEqual([])
    expect(parseUndoStack(undefined)).toEqual([])
    expect(parseUndoStack('broken')).toEqual([])
    expect(parseUndoStack({})).toEqual([])
    expect(parseUndoStack({ records: 'nope' })).toEqual([])
  })

  it('读取新版栈并丢弃残缺记录', () => {
    const stack = parseUndoStack({
      version: 2,
      records: [record('a', [entry('x')]), { id: 'b' }, record('c', [entry('y')])],
    })
    expect(stack.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('1.x 单条记录迁移为一条', () => {
    const stack = parseUndoStack(record('legacy', [entry('x')]))
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
    const stack = parseUndoStack(legacy)
    expect(stack.map((item) => item.id)).toEqual(['legacy', 'legacy:previous'])
    expect(stack[1].restoredIds).toEqual(['r0'])
    expect(stack[1].entries[0].parentId).toBe('11')
  })

  it('超出上限时截断', () => {
    const records = Array.from({ length: UNDO_STACK_LIMIT + 3 }, (_, i) =>
      record(`r${i}`, [entry(`n${i}`)]),
    )
    const stack = parseUndoStack({ version: 2, records })
    expect(stack).toHaveLength(UNDO_STACK_LIMIT)
    expect(stack[0].id).toBe('r0')
  })
})

describe('pruneUndoStack', () => {
  it('丢弃空记录', () => {
    expect(pruneUndoStack([record('a', []), record('b', [entry('x')])]).map((r) => r.id)).toEqual([
      'b',
    ])
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
