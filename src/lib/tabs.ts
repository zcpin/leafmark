// 链接打开方式（G5）：新标签页 / 当前页
import { isExtensionEnv } from './env'

export function openUrl(url: string, inNewTab: boolean): void {
  if (isExtensionEnv()) {
    if (inNewTab) {
      void chrome.tabs.create({ url, active: true })
    } else {
      location.assign(url)
    }
    return
  }
  // 开发预览回退
  window.open(url, inNewTab ? '_blank' : '_self')
}
