import { describe, expect, it } from 'vitest'

import { computePopupPosition } from '@/lib/popup-position'

const viewport = { width: 800, height: 600 }

describe('popup-position', () => {
  it('主卡片默认在锚点下方展开', () => {
    expect(
      computePopupPosition(
        { left: 100, right: 220, top: 80, bottom: 128 },
        { width: 300, height: 180 },
        viewport,
        false,
      ),
    ).toEqual({ left: 100, top: 136 })
  })

  it('底部空间不足时翻转到锚点上方', () => {
    expect(
      computePopupPosition(
        { left: 100, right: 220, top: 500, bottom: 548 },
        { width: 300, height: 180 },
        viewport,
        false,
      ),
    ).toEqual({ left: 100, top: 312 })
  })

  it('级联面板在右侧展开，右边缘不足时翻到左侧', () => {
    expect(
      computePopupPosition(
        { left: 700, right: 780, top: 120, bottom: 168 },
        { width: 240, height: 160 },
        viewport,
        true,
      ),
    ).toEqual({ left: 452, top: 116 })
  })

  it('位置不会小于视口安全边距', () => {
    expect(
      computePopupPosition(
        { left: -20, right: 20, top: -10, bottom: 30 },
        { width: 900, height: 700 },
        viewport,
        false,
      ),
    ).toEqual({ left: 8, top: 8 })
  })
})
