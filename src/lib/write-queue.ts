// 串行写队列：把并发的 storage 写入排队，避免后发先至造成的覆盖
// 从 settings store 抽出的公共部分，display / linkCheckOptions / background 也复用同一条尾巴

export interface WriteQueue {
  /** 排队执行一个写入动作；返回该动作的 promise */
  run<T>(action: () => Promise<T>): Promise<T>
  /** 等待当前队列排空（不提交新任务，也不透出失败） */
  settle(): Promise<void>
}

export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> | null = null

  function run<T>(action: () => Promise<T>): Promise<T> {
    // 前一个写入失败也要继续排队，否则一次失败会卡死后续所有写入
    const pending = tail ? tail.then(action, action) : action()
    tail = pending
    const done = () => {
      if (tail === pending) tail = null
    }
    void pending.then(done, done)
    return pending
  }

  return {
    run,
    settle: () =>
      tail
        ? tail.then(
            () => {},
            () => {},
          )
        : Promise.resolve(),
  }
}
