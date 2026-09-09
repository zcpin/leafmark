import { describe, expect, it } from 'vitest'
import { popupPageSize } from '@/lib/popup-position'

describe('悬停面板分页容量', () => {
  it('桌面容纳三列，并为翻页按钮预留高度', () => {
    expect(popupPageSize({ width: 1280, height: 800 }, 48)).toBe(36)
  })
  it('窄屏和大卡片减少每页数量', () => {
    expect(popupPageSize({ width: 375, height: 667 }, 80)).toBe(12)
  })
  it('极小视口仍至少显示一项', () => {
    expect(popupPageSize({ width: 180, height: 150 }, 80)).toBe(1)
  })
})
