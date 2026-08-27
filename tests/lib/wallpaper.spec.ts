import { describe, expect, it } from 'vitest'

import { validateImageFile } from '@/lib/wallpaper'

describe('wallpaper 工具（F3 校验）', () => {
  it('image/png 通过', () => {
    expect(validateImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
  })

  it('非图片被拒', () => {
    expect(validateImageFile(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe('notImage')
  })

  it('超过 10MB 被拒', () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    expect(validateImageFile(big)).toBe('tooLarge')
  })

  it('刚好 10MB 通过', () => {
    const exact = new File([new Uint8Array(10 * 1024 * 1024)], 'exact.png', { type: 'image/png' })
    expect(validateImageFile(exact)).toBeNull()
  })
})
