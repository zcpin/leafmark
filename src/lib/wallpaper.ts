// 壁纸压缩：本地上传图片压到 ≤1920px 宽的 JPEG/PNG dataURL（F3，控制 storage.local 配额）
// 纯函数 + Canvas API，可单测（注入 canvas/bitmap 以便 mock）
import { isExtensionEnv } from './env'

export interface CompressResult {
  dataUrl: string
  width: number
  height: number
}

const MAX_WIDTH = 1920
const MAX_BYTES = 5 * 1024 * 1024 // 5MB 软上限

/** 加载图片 dataURL → HTMLImageElement */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

/** 压缩：等比缩放到 maxWidth 以内，输出 JPEG dataURL */
export async function compressWallpaper(dataUrl: string): Promise<CompressResult> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_WIDTH / img.width)
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(img, 0, 0, width, height)

  // 优先 webp（体积小），不支持则 jpeg
  const mime = supportsWebP() ? 'image/webp' : 'image/jpeg'
  let quality = 0.82
  let out = canvas.toDataURL(mime, quality)

  // 若仍超 MAX_BYTES，逐步降质量
  while (out.length > MAX_BYTES && quality > 0.3) {
    quality -= 0.1
    out = canvas.toDataURL(mime, quality)
  }
  return { dataUrl: out, width, height }
}

function supportsWebP(): boolean {
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}

/** 校验上传文件（类型/大小） */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'notImage'
  if (file.size > 10 * 1024 * 1024) return 'tooLarge'
  return null
}

/** 读取文件为 dataURL */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 开发预览环境无打包壁纸资源时使用的占位渐变 dataURL */
export function placeholderWallpaper(): string {
  if (isExtensionEnv()) return ''
  return ''
}
