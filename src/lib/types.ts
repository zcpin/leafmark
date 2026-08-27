// 书签节点类型（chrome.bookmarks.BookmarkTreeNode 的项目内视图）
export interface BookmarkNode {
  id: string
  parentId?: string
  title: string
  /** 无 url 即文件夹 */
  url?: string
  children?: BookmarkNode[]
}

/** 当前展示文件夹 + 供 Breadcrumb 使用的路径段 */
export interface PathSegment {
  id: string
  title: string
}
