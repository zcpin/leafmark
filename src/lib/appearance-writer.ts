// 外观设置（滑块类）写入器：从 settings store 抽出的状态机
//
// 解决的问题：拖动滑块需要「本地值立刻生效」的预览体验，但 storage 写入必须防抖合并。
// 于是本地值和已落库值会短暂不一致，落库完成后要把权威值回写——
// 除非这期间用户又拖了滑块（版本号比对），否则旧请求会覆盖掉最新预览。

import type { WriteQueue } from './write-queue'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

export const DEFAULT_APPEARANCE_DELAY = 250

export interface AppearanceWriterOptions<S extends object> {
  /** 已落库的权威值 */
  initial: S
  /** 防抖时长（ms） */
  delay?: number
  /** 真正写入存储；入参是本次合并后的改动 */
  save(changes: Partial<S>): Promise<void>
  /** 按 key 分别回写权威值到响应式状态；映射类型让调用点无需断言 */
  apply: { [K in keyof S & string]: (value: S[K]) => void }
  /** 与其它写入共用一条串行队列（可选） */
  queue?: WriteQueue
}

export interface AppearanceWriter<S extends object> {
  /** 记录一次改动：标脏、合并待写、重启防抖；返回的 promise 在落库后 resolve */
  set<K extends keyof S & string>(key: K, value: S[K]): Promise<void>
  /** 立即提交挂起的改动；没有挂起改动时只等待在途写入结束 */
  flush(): Promise<void>
  /** 外部（初始化或 storage 变更）更新权威值：本地无未落库改动时才回写 */
  syncSaved<K extends keyof S & string>(key: K, value: S[K]): void
  /** 读取已落库的值 */
  saved<K extends keyof S & string>(key: K): S[K]
  /** 清理防抖定时器 */
  dispose(): void
}

export function createAppearanceWriter<S extends object>(
  options: AppearanceWriterOptions<S>,
): AppearanceWriter<S> {
  const delay = options.delay ?? DEFAULT_APPEARANCE_DELAY
  const queue = options.queue
  const saved = { ...options.initial }
  const changes: Partial<S> = {}
  const versions = new Map<string, number>()
  const dirty = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let deferred: Deferred | null = null

  function clearTimer() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  function applySaved(key: keyof S & string) {
    // 库内部唯一一处断言：key/value 的对应关系由映射类型保证
    const apply = options.apply[key] as (value: S[keyof S & string]) => void
    apply(saved[key])
  }

  function flush(): Promise<void> {
    clearTimer()
    if (!deferred) return queue ? queue.settle() : Promise.resolve()

    const current = deferred
    const batch = { ...changes } as Partial<S>
    const mutable = changes as Record<string, unknown>
    const keys = Object.keys(batch) as (keyof S & string)[]
    // 版本号快照：请求期间用户又改过就放弃回写
    const snapshot = new Map(versions)
    for (const key of keys) delete mutable[key]
    deferred = null

    const task = (async () => {
      try {
        await (queue ? queue.run(() => options.save(batch)) : options.save(batch))
        Object.assign(saved, batch)
      } finally {
        // 写入失败同样清脏并回写，否则界面会一直停在那个没保存成功的预览值上
        for (const key of keys) {
          if (versions.get(key) !== snapshot.get(key)) continue
          dirty.delete(key)
          applySaved(key)
        }
      }
    })()
    void task.then(current.resolve, current.reject)
    return current.promise
  }

  function set<K extends keyof S & string>(key: K, value: S[K]): Promise<void> {
    dirty.add(key)
    versions.set(key, (versions.get(key) ?? 0) + 1)
    ;(changes as Record<string, unknown>)[key] = value
    if (!deferred) deferred = createDeferred()
    clearTimer()
    timer = setTimeout(() => {
      void flush().catch(() => {})
    }, delay)
    return deferred.promise
  }

  function syncSaved<K extends keyof S & string>(key: K, value: S[K]): void {
    saved[key] = value
    if (dirty.has(key)) return
    options.apply[key](value)
  }

  return {
    set,
    flush,
    syncSaved,
    saved: (key) => saved[key],
    dispose: clearTimer,
  }
}
