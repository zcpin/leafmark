import { describe, expect, it } from 'vitest'

import { findNode, flatten, getPath, isFolder } from '@/lib/tree-utils'
import { SAMPLE_TREE } from '../mocks/chrome'

describe('tree-utils', () => {
  describe('findNode', () => {
    it('按 id 查找嵌套节点', () => {
      expect(findNode(SAMPLE_TREE, '1020')?.title).toBe('Vue')
    })

    it('查找根级节点', () => {
      expect(findNode(SAMPLE_TREE, '1')?.title).toBe('书签栏')
    })

    it('未找到返回 undefined', () => {
      expect(findNode(SAMPLE_TREE, 'not-exist')).toBeUndefined()
    })
  })

  describe('getPath', () => {
    it('返回从根到目标节点的完整路径', () => {
      const path = getPath(SAMPLE_TREE, '100')
      expect(path.map((n) => n.id)).toEqual(['0', '1', '10', '100'])
    })

    it('目标即根时返回单元素', () => {
      const path = getPath(SAMPLE_TREE, '1')
      expect(path.map((n) => n.id)).toEqual(['0', '1'])
    })

    it('未找到返回空数组', () => {
      expect(getPath(SAMPLE_TREE, 'not-exist')).toEqual([])
    })
  })

  describe('flatten', () => {
    it('展平整棵树并携带正确深度', () => {
      const flat = flatten(SAMPLE_TREE)
      const ids = flat.map((item) => item.node.id)
      expect(ids).toContain('0')
      expect(ids).toContain('1020')
      const gitHub = flat.find((item) => item.node.id === '100')
      expect(gitHub?.depth).toBe(3)
    })

    it('深度从 0 开始', () => {
      expect(flatten(SAMPLE_TREE)[0]?.depth).toBe(0)
    })
  })

  describe('isFolder', () => {
    it('无 url 的节点是文件夹', () => {
      expect(isFolder(SAMPLE_TREE[0]!.children![0]!)).toBe(true)
    })

    it('有 url 的节点不是文件夹', () => {
      expect(isFolder({ id: 'x', title: 't', url: 'https://a.b' })).toBe(false)
    })
  })
})
