// 两个 Pinia 实例模拟两个新标签页，仍共享浏览器 origin 级互斥。
export function installLockMock() {
  const pending = new Map<string, Promise<unknown>>()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(name: string, action: () => unknown) {
        const previous = pending.get(name) ?? Promise.resolve()
        const next = previous.catch(() => {}).then(action)
        pending.set(name, next)
        return next.finally(() => {
          if (pending.get(name) === next) pending.delete(name)
        })
      },
    },
  })
}
