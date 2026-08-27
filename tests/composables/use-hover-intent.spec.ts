import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useHoverIntent } from '@/composables/useHoverIntent'

describe('useHoverIntent（A9 目录悬停弹窗核心）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('悬停超过 openDelay（250ms）后才打开，防误触', () => {
    const { isOpen, enter } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(249)
    expect(isOpen.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isOpen.value).toBe(true)
  })

  it('已打开时再次 enter 不重复触发打开计时', () => {
    const { isOpen, enter } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(250)
    expect(isOpen.value).toBe(true)
    enter()
    vi.advanceTimersByTime(0)
    expect(isOpen.value).toBe(true)
  })

  it('离开后 closeDelay（200ms）宽限期内保持打开，超过后收起', () => {
    const { isOpen, enter, leave } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(250)
    leave()
    vi.advanceTimersByTime(199)
    expect(isOpen.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isOpen.value).toBe(false)
  })

  it('宽限期内移入弹窗（再次 enter）取消收起', () => {
    const { isOpen, enter, leave } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(250)
    leave()
    vi.advanceTimersByTime(150)
    enter() // 移入弹窗
    vi.advanceTimersByTime(1000)
    expect(isOpen.value).toBe(true)
  })

  it('closeNow 立即关闭', () => {
    const { isOpen, enter, closeNow } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(250)
    closeNow()
    expect(isOpen.value).toBe(false)
  })

  it('打开计时进行中 leave 可取消尚未打开的弹窗', () => {
    const { isOpen, enter, leave } = useHoverIntent()
    enter()
    vi.advanceTimersByTime(100)
    leave()
    vi.advanceTimersByTime(500)
    expect(isOpen.value).toBe(false)
  })

  it('支持自定义延迟参数', () => {
    const { isOpen, enter, leave } = useHoverIntent({ openDelay: 100, closeDelay: 50 })
    enter()
    vi.advanceTimersByTime(100)
    expect(isOpen.value).toBe(true)
    leave()
    vi.advanceTimersByTime(50)
    expect(isOpen.value).toBe(false)
  })
})
