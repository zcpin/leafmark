import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { compressWallpaper, readFileAsDataUrl } from '@/lib/wallpaper'

/** 桩：可控尺寸、src 赋值后异步触发 onload 的假图片 */
class FakeImage {
  width: number
  height: number
  private _src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(width = 3000, height = 2000) {
    this.width = width
    this.height = height
  }

  get src() {
    return this._src
  }

  set src(value: string) {
    this._src = value
    setTimeout(() => this.onload?.(), 0)
  }
}

interface FakeCanvas {
  width: number
  height: number
  getContext: () => { drawImage: () => void }
  toDataURL: (mime: string, quality: number) => string
}

function installCanvasStub(dataUrl = 'data:image/webp,fake') {
  const calls: { mime: string; quality: number }[] = []
  const make = (): FakeCanvas => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL: (mime: string, quality: number) => {
      calls.push({ mime, quality })
      return mime === 'image/webp' ? 'data:image/webp,ok' : dataUrl
    },
  })
  const originalCreate = document.createElement.bind(document)
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return make() as unknown as HTMLElement
    return originalCreate(tag)
  })
  return { spy, calls }
}

describe('compressWallpaper（F3 压缩）', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('超过 1920px 宽的图片等比缩放到 1920', async () => {
    const { spy } = installCanvasStub()
    const result = await compressWallpaper('data:image/jpeg,xxx')
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1280) // 3000x2000 → 1920x1280
    spy.mockRestore()
  })

  it('小于上限的图片保持原尺寸（scale=1）', async () => {
    vi.stubGlobal(
      'Image',
      class extends FakeImage {
        constructor() {
          super(1200, 800)
        }
      } as unknown as typeof Image,
    )
    const { spy } = installCanvasStub()
    const result = await compressWallpaper('data:image/jpeg,xxx')
    expect(result.width).toBe(1200)
    expect(result.height).toBe(800)
    spy.mockRestore()
  })

  it('输出 webp dataURL', async () => {
    installCanvasStub()
    const result = await compressWallpaper('data:image/png,xxx')
    expect(result.dataUrl).toBe('data:image/webp,ok')
    vi.restoreAllMocks()
  })
})

describe('readFileAsDataUrl', () => {
  it('读取文件为 dataURL', async () => {
    const file = new File(['hello'], 'a.png', { type: 'image/png' })
    const result = await readFileAsDataUrl(file)
    expect(result).toMatch(/^data:/)
  })
})
