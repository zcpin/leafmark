import { describe, expect, it, vi } from 'vitest'

import { createWriteQueue } from '@/lib/write-queue'

describe('createWriteQueue', () => {
  it('按提交顺序串行执行写入', async () => {
    const queue = createWriteQueue()
    const order: string[] = []
    let release!: () => void
    const first = queue.run(
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            order.push('first')
            resolve('a')
          }
        }),
    )
    const second = queue.run(async () => {
      order.push('second')
      return 'b'
    })

    expect(order).toEqual([])
    release()
    await expect(first).resolves.toBe('a')
    await expect(second).resolves.toBe('b')
    expect(order).toEqual(['first', 'second'])
  })

  it('前一个写入失败不会阻塞后续写入', async () => {
    const queue = createWriteQueue()
    const failing = queue.run(async () => {
      throw new Error('quota exceeded')
    })
    const next = queue.run(async () => 'ok')

    await expect(failing).rejects.toThrow('quota exceeded')
    await expect(next).resolves.toBe('ok')
  })

  it('settle 等待在途写入且不透出失败', async () => {
    const queue = createWriteQueue()
    let release!: () => void
    void queue.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let settled = false
    const waiting = queue.settle().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await waiting
    expect(settled).toBe(true)
  })

  it('空队列 settle 立即完成', async () => {
    const queue = createWriteQueue()
    await expect(queue.settle()).resolves.toBeUndefined()
  })

  it('失败后再 settle 仍然成功', async () => {
    const queue = createWriteQueue()
    const failing = queue.run(async () => {
      throw new Error('boom')
    })
    await expect(queue.settle()).resolves.toBeUndefined()
    await expect(failing).rejects.toThrow('boom')
  })

  it('run 透出原始返回值', async () => {
    const queue = createWriteQueue()
    const spy = vi.fn().mockResolvedValue(42)
    await expect(queue.run(spy)).resolves.toBe(42)
  })
})
