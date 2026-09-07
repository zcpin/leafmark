import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import Clock from '@/components/Clock.vue'
import YearProgress from '@/components/YearProgress.vue'
import { useNow } from '@/composables/useNow'

const TimeWidgets = defineComponent({
  setup() {
    const now = useNow()
    return () => h('div', [h(Clock, { now: now.value }), h(YearProgress, { now: now.value })])
  },
})

describe('页面时间更新', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('对齐整分钟，跨年同时更新时钟和年度进度', async () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 30))
    const wrapper = mount(TimeWidgets)
    expect(wrapper.get('time').text()).toBe('23:59')
    expect(wrapper.text()).toContain('2026 年进度')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('99.9')
    expect(wrapper.text()).toContain('剩余 1 天')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.get('time').text()).toBe('00:00')
    expect(wrapper.text()).toContain('2027 年进度')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
    expect(wrapper.text()).toContain('剩余 365 天')

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('重新显示休眠标签页时立即刷新，且不重复创建定时器', async () => {
    vi.setSystemTime(new Date(2027, 11, 31, 23, 59))
    const wrapper = mount(TimeWidgets)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    vi.setSystemTime(new Date(2028, 0, 1, 8, 30))
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.text()).toContain('2027 年进度')

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.get('time').text()).toBe('08:30')
    expect(wrapper.text()).toContain('2028 年进度')
    expect(wrapper.text()).toContain('剩余 366 天')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
