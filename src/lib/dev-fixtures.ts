// 开发预览（pnpm dev，无 chrome API 环境）使用的示例书签树
// 测试 mock（tests/mocks/chrome.ts）同样以此作为初始数据，避免两份漂移
import type { BookmarkNode } from './types'

export const DEV_BOOKMARK_TREE: BookmarkNode[] = [
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
              {
                id: '102',
                title: '前端',
                parentId: '10',
                children: [{ id: '1020', title: 'Vue', url: 'https://vuejs.org', parentId: '102' }],
              },
            ],
          },
          { id: '11', title: 'Example', url: 'https://example.com', parentId: '1' },
        ],
      },
      { id: '2', title: '其他书签', parentId: '0', children: [] },
    ],
  },
]
