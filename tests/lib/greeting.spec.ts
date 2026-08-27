import { describe, expect, it } from 'vitest'

import { greetingKey } from '@/lib/greeting'

describe('greeting（F7 时段问候）', () => {
  it('5~12 点为早上好', () => {
    expect(greetingKey(new Date('2026-08-27T06:00:00'))).toBe('welcomeMorning')
    expect(greetingKey(new Date('2026-08-27T11:59:00'))).toBe('welcomeMorning')
  })

  it('12~18 点为下午好', () => {
    expect(greetingKey(new Date('2026-08-27T12:00:00'))).toBe('welcomeAfternoon')
    expect(greetingKey(new Date('2026-08-27T17:59:00'))).toBe('welcomeAfternoon')
  })

  it('18~22 点为晚上好', () => {
    expect(greetingKey(new Date('2026-08-27T18:00:00'))).toBe('welcomeEvening')
    expect(greetingKey(new Date('2026-08-27T21:59:00'))).toBe('welcomeEvening')
  })

  it('22~5 点为夜深了', () => {
    expect(greetingKey(new Date('2026-08-27T22:00:00'))).toBe('welcomeNight')
    expect(greetingKey(new Date('2026-08-27T04:59:00'))).toBe('welcomeNight')
    expect(greetingKey(new Date('2026-08-27T00:00:00'))).toBe('welcomeNight')
  })
})
