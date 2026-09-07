// 标签页与标签组：批量打开 + 分组（B3）、二维码（B2）
// 非扩展环境回退到 window.open（无分组能力）
import { callChrome } from './chrome-bridge'
import { isExtensionEnv } from './env'

/** 在新标签页打开单个 URL */
export function openUrl(url: string, inNewTab: boolean): void {
  if (isExtensionEnv()) {
    if (inNewTab) {
      // 单个打开保持原有 void 语义；桥接负责读取 lastError，失败不产生未处理 rejection。
      void callChrome<chrome.tabs.Tab>((cb) => chrome.tabs.create({ url, active: true }, cb)).catch(
        () => {},
      )
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

  const createdIds = await Promise.all(
    valid.map(async (url) => {
      try {
        const tab = await callChrome<chrome.tabs.Tab>((cb) =>
          chrome.tabs.create({ url, active: false }, cb),
        )
        return tab?.id ?? null
      } catch {
        // 批量打开采用最佳努力策略：单个 URL 失败不阻塞其余 URL。
        return null
      }
    }),
  )
  const tabIds = createdIds.filter((id): id is number => id != null)

  if (tabIds.length > 1 && chrome.tabs.group && chrome.tabGroups) {
    try {
      const groupId = await callChrome<number>((cb) =>
        chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] }, cb),
      )
      await callChrome<unknown>((cb) =>
        chrome.tabGroups.update(groupId, { title: groupTitle, color: 'cyan' }, cb),
      )
    } catch {
      // 分组是增强能力；标签页已打开时，分组失败不回滚已完成的打开动作。
    }
  }
}
