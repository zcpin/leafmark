// Chrome 回调式调用的共享 adapter
// 统一读取 runtime.lastError，并把同步抛错转换为 Promise rejection。
export type ChromeInvocation<T> = (callback: (result: T) => void) => void

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function callChrome<T>(invoke: ChromeInvocation<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = (result: T) => {
      const lastError = typeof chrome !== 'undefined' ? chrome.runtime?.lastError : undefined
      if (lastError) {
        reject(new Error(lastError.message || 'Chrome API call failed'))
        return
      }
      resolve(result)
    }

    try {
      invoke(callback)
    } catch (error) {
      reject(normalizeError(error))
    }
  })
}
