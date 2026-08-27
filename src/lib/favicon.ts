// favicon（依赖 favicon 权限，扩展页内可用 chrome-extension://…/_favicon/）
// 开发预览返回空串，由组件回退到首字母头像（不发起任何网络请求）
import { isExtensionEnv } from './env'

export function faviconUrl(pageUrl: string, size: 16 | 32 | 64 = 32): string {
  if (!isExtensionEnv()) return ''
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', String(size))
  return url.toString()
}
