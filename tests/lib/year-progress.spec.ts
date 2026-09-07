import { afterEach, describe, expect, it, vi } from 'vitest'

import { getYearProgress } from '@/lib/year-progress'

describe('年度进度', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('元旦从零开始，平年共 365 天', () => {
    const progress = getYearProgress(new Date(2026, 0, 1))
    expect(progress.year).toBe(2026)
    expect(progress.percent).toBe(0)
    expect(progress.daysRemaining).toBe(365)
    expect(progress.months).toEqual(Array(12).fill(0))
  })

  it('闰年的二月保留第 29 天', () => {
    const progress = getYearProgress(new Date(2028, 1, 29, 12))
    expect(progress.daysRemaining).toBe(307)
    expect(progress.months[0]).toBe(100)
    expect(progress.months[1]).toBeCloseTo((28.5 / 29) * 100)
    expect(progress.months[2]).toBe(0)
  })

  it('月份刻度分别表示已过、当前和未来月份', () => {
    const progress = getYearProgress(new Date(2026, 8, 16))
    expect(progress.months).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 50, 0, 0, 0])
    expect(progress.daysRemaining).toBe(107)
  })

  it('年末进度小于 100%，今天仍计入剩余天数', () => {
    const progress = getYearProgress(new Date(2026, 11, 31, 23, 59, 59))
    expect(progress.percent).toBeGreaterThan(99.99)
    expect(progress.percent).toBeLessThan(100)
    expect(progress.daysRemaining).toBe(1)
  })

  it('夏令时切换不改变日历剩余天数', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(getYearProgress(new Date(2026, 2, 8, 23, 30)).daysRemaining).toBe(299)
    expect(getYearProgress(new Date(2026, 2, 9)).daysRemaining).toBe(298)
  })
})
