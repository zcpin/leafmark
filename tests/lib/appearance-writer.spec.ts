import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppearanceWriter, DEFAULT_APPEARANCE_DELAY } from '@/lib/appearance-writer'
import { createWriteQueue } from '@/lib/write-queue'

type Shape = { width: number; opacity: number }

function makeWriter(
  overrides: { queue?: ReturnType<typeof createWriteQueue>; delay?: number } = {},
) {
  const save = vi.fn<(changes: Partial<Shape>) => Promise<void>>().mockResolvedValue(undefined)
  const applied: Array<[keyof Shape, number]> = []
  const writer = createAppearanceWriter<Shape>({
    initial: { width: 100, opacity: 15 },
    save,
    queue: overrides.queue,
    delay: overrides.delay,
    apply: {
      width: (value) => {
        applied.push(['width', value])
      },
      opacity: (value) => {
        applied.push(['opacity', value])
      },
    },
  })
  return { writer, save, applied }
}

describe('createAppearanceWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('防抖窗口内的连续改动合并成一次写入，值为最后一次', async () => {
    const { writer, save } = makeWriter()
    const pending = writer.set('width', 110)
    writer.set('width', 120)
    writer.set('width', 130)

    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)

    await pending
    expect(save).toHaveBeenCalledExactlyOnceWith({ width: 130 })
    expect(writer.saved('width')).toBe(130)
  })

  it('flush 立即提交尚未到防抖时间的改动', async () => {
    const { writer, save, applied } = makeWriter()
    const pending = writer.set('width', 140)

    await writer.flush()

    expect(save).toHaveBeenCalledExactlyOnceWith({ width: 140 })
    // 落库后回写权威值，界面与存储对齐
    expect(applied).toEqual([['width', 140]])
    await pending
  })

  it('没有挂起改动时 flush 不写存储', async () => {
    const { writer, save } = makeWriter()

    await writer.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('旧写入完成时不覆盖期间产生的新预览', async () => {
    const { writer, save, applied } = makeWriter()
    let release!: () => void
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const first = writer.set('width', 110)
    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)
    // 第一次写入仍在途，用户又拖了滑块
    const second = writer.set('width', 180)
    release()
    await first

    // 版本已变：不回写 110，否则界面会跳回旧值
    expect(applied).toEqual([])

    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)
    await second
    expect(save).toHaveBeenLastCalledWith({ width: 180 })
    expect(applied).toEqual([['width', 180]])
  })

  it('写入失败时回写已落库值并让调用方感知', async () => {
    const { writer, save, applied } = makeWriter()
    save.mockRejectedValueOnce(new Error('quota exceeded'))

    const pending = writer.set('width', 150)
    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)

    await expect(pending).rejects.toThrow('quota exceeded')
    expect(applied).toEqual([['width', 100]])
    expect(writer.saved('width')).toBe(100)
  })

  it('syncSaved 在本地有未落库改动时不回写', async () => {
    const { writer, applied } = makeWriter()
    const pending = writer.set('width', 160)

    writer.syncSaved('width', 999)
    expect(applied).toEqual([])

    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)
    await pending
    writer.syncSaved('width', 300)
    expect(applied).toEqual([
      ['width', 160],
      ['width', 300],
    ])
  })

  it('不同 key 的改动合并进同一次写入', async () => {
    const { writer, save, applied } = makeWriter()
    writer.set('width', 120)
    writer.set('opacity', 30)

    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)

    expect(save).toHaveBeenCalledExactlyOnceWith({ width: 120, opacity: 30 })
    expect(applied).toEqual([
      ['width', 120],
      ['opacity', 30],
    ])
  })

  it('dispose 取消尚未触发的防抖写入', async () => {
    const { writer, save } = makeWriter()
    void writer.set('width', 170)
    writer.dispose()

    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY * 2)

    expect(save).not.toHaveBeenCalled()
  })

  it('写入经由传入的队列串行化', async () => {
    const queue = createWriteQueue()
    const { writer, save } = makeWriter({ queue })
    const order: string[] = []
    let release!: () => void
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            order.push('appearance')
            resolve()
          }
        }),
    )

    const pending = writer.set('width', 110)
    await vi.advanceTimersByTimeAsync(DEFAULT_APPEARANCE_DELAY)
    const other = queue.run(async () => {
      order.push('other')
    })

    release()
    await Promise.all([pending, other])
    expect(order).toEqual(['appearance', 'other'])
  })

  it('自定义 delay 生效', async () => {
    const { writer, save } = makeWriter({ delay: 40 })
    void writer.set('width', 111)

    await vi.advanceTimersByTimeAsync(39)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledExactlyOnceWith({ width: 111 })
  })
})
