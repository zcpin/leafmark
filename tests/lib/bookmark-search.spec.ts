// 书签搜索纯函数：归一化、分词、打分、排序、路径
import { describe, expect, it } from 'vitest'

import {
  normalizeText,
  normalizeUrl,
  scoreNode,
  searchBookmarks,
  tokenize,
} from '@/lib/bookmark-search'
import type { BookmarkNode } from '@/lib/types'

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
            { id: '10', title: 'Example Docs', parentId: '1', url: 'https://example.com/docs' },
            {
              id: '11',
              title: '前端',
              parentId: '1',
              children: [
                { id: '110', title: 'Vue Guide', parentId: '11', url: 'https://vuejs.org/guide' },
                { id: '112', title: '后端笔记', parentId: '11', url: 'https://notes.test/x' },
              ],
            },
            { id: '12', title: 'Other Example', parentId: '1', url: 'https://other.test/page' },
            { id: '13', title: 'A', parentId: '1', url: 'https://a.test/x' },
            { id: '14', title: 'B', parentId: '1', url: 'https://b.test/y' },
          ],
        },
        { id: '2', title: '其他书签', parentId: '0', children: [] },
      ],
    },
  ]
}

function ids(query: string): string[] {
  return searchBookmarks(tree(), query).map((hit) => hit.node.id)
}

describe('bookmark-search（归一化与分词）', () => {
  it('标题归一化：去首尾空白、折叠连续空白、转小写', () => {
    expect(normalizeText('  Example   Docs ')).toBe('example docs')
  })

  it('URL 归一化：去协议与末尾斜杠', () => {
    expect(normalizeUrl('HTTPS://Example.com/docs/')).toBe('example.com/docs')
    expect(normalizeUrl('https://developer.mozilla.org/')).toBe('developer.mozilla.org')
  })

  it('分词按空白切分并丢弃空词元', () => {
    expect(tokenize('  vue   docs ')).toEqual(['vue', 'docs'])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('bookmark-search（匹配与打分）', () => {
  it('空查询不产生结果', () => {
    expect(ids('   ')).toEqual([])
    expect(ids('')).toEqual([])
  })

  it('标题匹配大小写不敏感', () => {
    expect(ids('EXAMPLE')).toEqual(['10', '12'])
  })

  it('标题以完整查询开头时得分最高，排在标题包含之前', () => {
    // 10：词元开头 60 + 完整查询前缀加权 40 = 100；12：标题包含 40
    expect(ids('example')).toEqual(['10', '12'])
  })

  it('多个词元按 AND 匹配，缺一个即不命中', () => {
    expect(ids('example docs')).toEqual(['10'])
    expect(ids('example vue')).toEqual([])
  })

  it('URL 主机名以词元开头按 25 计分', () => {
    const hit = searchBookmarks(tree(), 'vuejs.org')[0]
    expect(hit.node.id).toBe('110')
    expect(hit.score).toBe(25)
  })

  it('URL 只包含词元时按 20 计分', () => {
    // 112：主机 notes.test 不以 test 开头，只能算 URL 包含 = 20
    const hit = searchBookmarks(tree(), 'test')[0]
    expect(hit.node.id).toBe('112')
    expect(hit.score).toBe(20)
  })

  it('书签的标题包含优先于文件夹的标题包含', () => {
    // 112 书签标题包含「端」= 40；11 文件夹标题包含「端」= 30
    expect(ids('端')).toEqual(['112', '11'])
  })

  it('同分结果保持树的深度优先序', () => {
    expect(ids('test')).toEqual(['112', '12', '13', '14'])
  })

  it('路径为所在文件夹标题链，不含自身', () => {
    const hits = searchBookmarks(tree(), 'vue')
    expect(hits[0].path).toEqual(['书签栏', '前端'])
    expect(searchBookmarks(tree(), 'other')[0].path).toEqual(['书签栏'])
  })

  it('文件夹自身也能被搜到', () => {
    const hit = searchBookmarks(tree(), '前端')[0]
    expect(hit.node.id).toBe('11')
    expect(hit.path).toEqual(['书签栏'])
  })

  it('未命中时得分为 0', () => {
    const node: BookmarkNode = { id: 'x', title: 'Alpha', url: 'https://alpha.test/' }
    expect(scoreNode(node, ['beta'], 'beta')).toBe(0)
  })
})
