// 标签页与标签组：批量打开 + 分组（B3）、二维码（B2）
// 非扩展环境回退到 window.open（无分组能力）
import { isExtensionEnv } from './env'

/** 在新标签页打开单个 URL */
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

/**
 * 批量打开一组 URL 并放入同色标签组（B3）
 * 仅单个 URL 时不分组；非扩展环境逐个 window.open
 */
export async function openAllInGroup(urls: string[], groupTitle?: string): Promise<void> {
  const valid = urls.filter((u) => !!u)
  if (valid.length === 0) return

  if (!isExtensionEnv()) {
    valid.forEach((u) => window.open(u, '_blank'))
    return
  }

  const tabIds: number[] = []
  await Promise.all(
    valid.map(
      (url) =>
        new Promise<void>((resolve) => {
          chrome.tabs.create({ url, active: false }, (tab) => {
            if (tab?.id != null) tabIds.push(tab.id)
            resolve()
          })
        }),
    ),
  )

  if (tabIds.length > 1 && chrome.tabs.group && chrome.tabGroups) {
    await new Promise<void>((resolve) => {
      chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] }, (groupId) => {
        if (chrome.runtime.lastError) {
          resolve()
          return
        }
        chrome.tabGroups.update(
          groupId,
          { title: groupTitle, color: 'cyan' },
          () => resolve(),
        )
      })
    })
  }
}
