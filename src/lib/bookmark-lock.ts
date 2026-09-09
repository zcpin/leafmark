import { isExtensionEnv } from './env'

let previewQueue: Promise<unknown> = Promise.resolve()

/** 同一扩展 origin 的所有新标签页共用一把锁，删除和恢复不能交错执行。 */
export async function withBookmarkLock<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks?.request) return navigator.locks.request('leafmark-bookmark-write', action)
  if (isExtensionEnv()) return Promise.reject(new Error('Web Locks unavailable'))
  const pending = previewQueue.then(action, action)
  previewQueue = pending.catch(() => {})
  return pending
}
