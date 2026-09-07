import { describe, expect, it, vi } from 'vitest'

import QRCode from 'qrcode'

import { downloadQr, generateQrDataUrl } from '@/lib/qrcode'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test'),
  },
}))

describe('qrcode', () => {
  it('生成指定尺寸和样式的 data URL', async () => {
    const result = await generateQrDataUrl('https://example.com', 320)

    expect(result).toBe('data:image/png;base64,test')
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://example.com', {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  })

  it('下载时生成 ASCII 安全文件名并触发 anchor click', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const append = vi.spyOn(document.body, 'appendChild')

    try {
      downloadQr('data:image/png;base64,test', 'GitHub / Docs')

      expect(click).toHaveBeenCalledTimes(1)
      const anchor = append.mock.calls.at(-1)?.[0] as HTMLAnchorElement
      expect(anchor.download).toBe('github___docs_qrcode.png')
      expect(anchor.href).toContain('data:image/png;base64,test')
    } finally {
      click.mockRestore()
      append.mockRestore()
    }
  })

  it('空标题回退为 qrcode 文件名', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const append = vi.spyOn(document.body, 'appendChild')

    try {
      downloadQr('data:image/png;base64,test', '---')
      const anchor = append.mock.calls.at(-1)?.[0] as HTMLAnchorElement
      expect(anchor.download).toBe('qrcode_qrcode.png')
    } finally {
      click.mockRestore()
      append.mockRestore()
    }
  })
})
