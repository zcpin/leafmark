// 书签树纯函数：无副作用、无 chrome 依赖，测试重点
import type { BookmarkNode } from './types'

/** 递归查找节点，找不到返回 undefined */
export function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

/** 从根到目标节点的路径（面包屑数据源），未找到返回空数组 */
export function getPath(nodes: BookmarkNode[], id: string): BookmarkNode[] {
  const target = findNode(nodes, id)
  if (!target) return []

  const path: BookmarkNode[] = [target]
  let current: BookmarkNode | undefined = target
  while (current?.parentId) {
    const parent = findNode(nodes, current.parentId)
    if (!parent) break
    path.unshift(parent)
    current = parent
  }
  return path
}

export interface FlatNode {
  node: BookmarkNode
  depth: number
}

/** 深度优先展平整棵树（侧栏树渲染数据源） */
export function flatten(nodes: BookmarkNode[], depth = 0): FlatNode[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.children ? flatten(node.children, depth + 1) : []),
  ])
}

/** 无 url 即文件夹 */
export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined
}
