// chrome.storage 的类型化封装
// 非扩展环境回退 localStorage，键值均 JSON 序列化
import { callChrome } from './chrome-bridge'
import { isExtensionEnv } from './env'

type StorageAreaName = 'sync' | 'local'

export async function storageGet<T>(
  key: string,
  fallback: T,
  area: StorageAreaName = 'sync',
): Promise<T> {
  if (!isExtensionEnv()) {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  }
  return callChrome<Record<string, unknown>>((cb) => {
    // 传入 {key: fallback} 对象形式，chrome 会用默认值补齐缺失键
    chrome.storage[area].get({ [key]: fallback }, cb)
  }).then((items) => (items[key] ?? fallback) as T)
}

export async function storageSet(
  key: string,
  value: unknown,
  area: StorageAreaName = 'sync',
): Promise<void> {
  if (!isExtensionEnv()) {
    localStorage.setItem(key, JSON.stringify(value))
    return
  }
  return callChrome<void>((cb) => chrome.storage[area].set({ [key]: value }, cb))
}

/** 监听指定区域的存储变更，返回取消订阅函数（设置页与多视图同步用） */
export function onStorageChanged(
  listener: (key: string, newValue: unknown) => void,
  area: StorageAreaName = 'sync',
): () => void {
  if (!isExtensionEnv()) return () => {}
  const handler = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== area) return
    for (const [key, change] of Object.entries(changes)) {
      listener(key, change.newValue)
    }
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}
