// 二维码（B2）：生成 PNG data URL 与下载文件名
// 纯本地生成，零网络请求；非扩展环境同样可用（Canvas API）
import QRCode from 'qrcode'

/** 生成 PNG data URL（默认 240px） */
export async function generateQrDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

/** 触发下载（文件名取自书签标题，转 ASCII 安全字符） */
export function downloadQr(dataUrl: string, title: string): void {
  const safe = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'qrcode'
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${safe}_qrcode.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
