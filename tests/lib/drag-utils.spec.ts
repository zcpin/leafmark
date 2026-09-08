import { describe, expect, it } from 'vitest'

import { cardDropZone, computeDropIndex, dropIntoFolder, isSamePosition, resolveCardDrop, resolveGridDrop } from '@/lib/drag-utils'
import { SAMPLE_TREE } from '../mocks/chrome'
import type { BookmarkNode } from '@/lib/types'

const make = (id: string): BookmarkNode => ({ id, title: id })

describe('drag-utils', () => {
  it('书签分前后，文件夹中央为移入', () => {
    expect(cardDropZone(10, 0, 100, false)).toBe('before')
    expect(cardDropZone(90, 0, 100, false)).toBe('after')
    expect(cardDropZone(50, 0, 100, true)).toBe('inside')
    expect(cardDropZone(10, 0, 100, true)).toBe('before')
    expect(cardDropZone(90, 0, 100, true)).toBe('after')
  })

  it('移动前索引用于 Chrome API，不会双重扣除源位置', () => {
    expect(resolveCardDrop(SAMPLE_TREE, '100', '101', 'after')).toEqual({ parentId: '10', index: 2 })
    expect(resolveCardDrop(SAMPLE_TREE, '101', '100', 'before')).toEqual({ parentId: '10', index: 0 })
    expect(resolveCardDrop(SAMPLE_TREE, '100', '101', 'before')).toBeNull()
  })

  it('级联面板落点使用目标实际父目录', () => {
    expect(resolveCardDrop(SAMPLE_TREE, '11', '101', 'before')).toEqual({ parentId: '10', index: 1 })
  })

  it('禁止移入自身后代，网格空白区移动到末尾', () => {
    expect(resolveCardDrop(SAMPLE_TREE, '10', '102', 'inside')).toBeNull()
    expect(resolveCardDrop(SAMPLE_TREE, '10', '1020', 'after')).toBeNull()
    expect(resolveGridDrop(SAMPLE_TREE, '11', '10')).toEqual({ parentId: '10', index: 3 })
  })
  describe('computeDropIndex', () => {
    it('空列表落点为 0', () => {
      expect(computeDropIndex([], 100, 60, 4, '1')).toEqual({ parentId: '1', index: 0 })
    })

    it('指针在第一行 → index 0', () => {
      const nodes = Array.from({ length: 8 }, (_, i) => make(String(i)))
      expect(computeDropIndex(nodes, 30, 60, 4, '1')).toEqual({ parentId: '1', index: 0 })
    })

    it('指针在第二行 → index 4（4 列网格）', () => {
      const nodes = Array.from({ length: 8 }, (_, i) => make(String(i)))
      expect(computeDropIndex(nodes, 70, 60, 4, '1')).toEqual({ parentId: '1', index: 4 })
    })

    it('指针超出底部 → 落到最后一行起点', () => {
      const nodes = Array.from({ length: 6 }, (_, i) => make(String(i)))
      // 6 个节点 4 列 = 2 行，最后一行 index 4
      expect(computeDropIndex(nodes, 999, 60, 4, '1')).toEqual({ parentId: '1', index: 4 })
    })

    it('负坐标钳制到第一行', () => {
      const nodes = Array.from({ length: 4 }, (_, i) => make(String(i)))
      expect(computeDropIndex(nodes, -50, 60, 4, '2')).toEqual({ parentId: '2', index: 0 })
    })
  })

  describe('dropIntoFolder', () => {
    it('返回进入文件夹的目标', () => {
      expect(dropIntoFolder('10')).toEqual({ parentId: '10', index: 0 })
    })
  })

  describe('isSamePosition', () => {
    it('同父同序视为相同', () => {
      expect(isSamePosition('a', '1', 2, { parentId: '1', index: 2 })).toBe(true)
    })

    it('不同父视为不同', () => {
      expect(isSamePosition('a', '1', 2, { parentId: '2', index: 2 })).toBe(false)
    })

    it('同父不同序视为不同', () => {
      expect(isSamePosition('a', '1', 2, { parentId: '1', index: 3 })).toBe(false)
    })
  })
})
