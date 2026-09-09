// 生成 Leafmark 正式图标（16/48/128 PNG）：绿色渐变圆角底 + 白色叶片
// 零依赖：Node 内置 zlib 手写 PNG 编码（IHDR + IDAT + IEND + CRC32）
// 用法：node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

// ---------- PNG 编码 ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 形状判定 ----------
const lerp = (a, b, t) => a + (b - a) * t

/** 圆角方形覆盖度（超采样点的圆角矩形内外判定） */
function inRoundedRect(u, v, r) {
  const x = Math.max(0, Math.min(1, u))
  const y = Math.max(0, Math.min(1, v))
  const dx = Math.max(0, Math.abs(x - 0.5) - (0.5 - r))
  const dy = Math.max(0, Math.abs(y - 0.5) - (0.5 - r))
  return dx * dx + dy * dy <= r * r
}

/**
 * 叶形：以中心为原点、指向右上（旋转 -45°），
 * 半宽 hw / 半高 hh，双抛物线围合：|lx| ≤ hw·sqrt(1-(ly/hh)²)
 */
function inLeaf(u, v, hw, hh) {
  // 平移到中心
  let x = u - 0.5
  let y = v - 0.5
  // 旋转 -45°（叶尖指向右上）
  const c = Math.SQRT1_2
  const rx = (x - y) * c
  const ry = (x + y) * c
  const ny = ry / hh
  if (Math.abs(ny) > 1) return false
  return Math.abs(rx) <= hw * Math.sqrt(1 - ny * ny)
}

/** 叶脉：叶长轴上的细线 */
function inVein(u, v, hw, hh, thickness) {
  let x = u - 0.5
  let y = v - 0.5
  const c = Math.SQRT1_2
  const rx = (x - y) * c
  const ry = (x + y) * c
  const ny = ry / hh
  return Math.abs(ny) <= 0.96 && Math.abs(rx) <= thickness
}

// ---------- 渲染 ----------
const BG_TOP = [52, 211, 153] // #34d399
const BG_BOTTOM = [5, 150, 105] // #059669
const VEIN = [5, 150, 105]

export function renderIcon(size, padding = 0) {
  const rgba = Buffer.alloc(size * size * 4)
  const artworkSize = size - padding * 2
  const ss = size >= 48 ? 3 : 2 // 超采样倍率（抗锯齿）
  const radius = size < 32 ? 0.3 : 0.22
  const hw = size < 32 ? 0.16 : 0.17 // 叶半宽（归一化）
  const hh = size < 32 ? 0.3 : 0.32 // 叶半高
  const veinW = size < 32 ? 0 : 0.018 // 小尺寸省略叶脉

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < padding || y < padding || x >= size - padding || y >= size - padding) continue
      let bgA = 0
      let leafA = 0
      let veinA = 0
      let grad = 0
      const samples = ss * ss
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x - padding + (sx + 0.5) / ss) / artworkSize
          const v = (y - padding + (sy + 0.5) / ss) / artworkSize
          if (inRoundedRect(u, v, radius)) {
            bgA++
            grad += (u + v) / 2 // 对角渐变位置
            if (inLeaf(u, v, hw, hh)) {
              leafA++
              if (veinW > 0 && inVein(u, v, hw, hh, veinW)) veinA++
            }
          }
        }
      }
      const i = (y * size + x) * 4
      if (bgA === 0) {
        rgba[i + 3] = 0
        continue
      }
      const t = grad / bgA
      let r = lerp(BG_TOP[0], BG_BOTTOM[0], t)
      let g = lerp(BG_TOP[1], BG_BOTTOM[1], t)
      let b = lerp(BG_TOP[2], BG_BOTTOM[2], t)
      const a = Math.round((bgA / samples) * 255)

      // 叶片（白色）盖在背景上，叶脉呈深绿细线
      const leafCov = leafA / samples
      const veinCov = veinA / samples
      if (leafCov > 0) {
        const veinRatio = veinCov > 0 ? Math.min(1, veinCov / leafCov) : 0
        r = lerp(255, VEIN[0], veinRatio * 0.85)
        g = lerp(255, VEIN[1], veinRatio * 0.85)
        b = lerp(255, VEIN[2], veinRatio * 0.85)
      }
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = a
    }
  }
  return encodePng(size, rgba)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const size of [16, 48, 128]) {
    const png = renderIcon(size, size === 128 ? 16 : 0)
    const file = join(outDir, `icon-${size}.png`)
    writeFileSync(file, png)
    console.log(`✓ ${file} (${png.length} bytes)`)
  }
}
