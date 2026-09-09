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
  const values = await storageGetMany({ [key]: fallback }, area)
  return values[key] as T
}

/** 同一区域的设置一次读取，避免逐键往返浏览器进程。 */
export async function storageGetMany<T extends Record<string, unknown>>(defaults: T, area: StorageAreaName = 'sync'): Promise<T> {
  if (!isExtensionEnv()) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const raw = localStorage.getItem(key)
      return [key, raw === null ? fallback : JSON.parse(raw) ?? fallback]
    })) as T
  }
  const items = await callChrome<Record<string, unknown>>((cb) => chrome.storage[area].get(defaults, cb))
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, items[key] ?? fallback])) as T
}

export async function storageSet(
  key: string,
  value: unknown,
  area: StorageAreaName = 'sync',
): Promise<void> {
  return storageSetMany({ [key]: value }, area)
}

export async function storageSetMany(values: Record<string, unknown>, area: StorageAreaName = 'sync'): Promise<void> {
  if (!isExtensionEnv()) {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value))
    return
  }
  return callChrome<void>((cb) => chrome.storage[area].set(values, cb))
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
