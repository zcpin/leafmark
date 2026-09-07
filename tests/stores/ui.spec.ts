import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUiStore } from '@/stores/ui'

describe('ui store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('confirm 暴露选项并以用户选择 resolve', async () => {
    const ui = useUiStore()
    const pending = ui.confirm({ title: '删除', message: '确定吗？', danger: true })

    expect(ui.confirmVisible).toBe(true)
    expect(ui.confirmOptions).toEqual({ title: '删除', message: '确定吗？', danger: true })

    ui.resolveConfirm(true)

    await expect(pending).resolves.toBe(true)
    expect(ui.confirmVisible).toBe(false)
  })

  it('openEdit 暴露编辑状态并返回结果', async () => {
    const ui = useUiStore()
    const pending = ui.openEdit({
      id: '100',
      title: '旧标题',
      url: 'https://old.test',
      isFolder: false,
    })

    expect(ui.editVisible).toBe(true)
    expect(ui.editState).toEqual({
      id: '100',
      title: '旧标题',
      url: 'https://old.test',
      isFolder: false,
    })

    ui.resolveEdit({ title: '新标题', url: 'https://new.test' })

    await expect(pending).resolves.toEqual({ title: '新标题', url: 'https://new.test' })
    expect(ui.editVisible).toBe(false)
    expect(ui.editState).toBeNull()
  })

  it('openQr 暴露二维码内容并在关闭时 resolve', async () => {
    const ui = useUiStore()
    const pending = ui.openQr('https://github.com', 'GitHub')

    expect(ui.qrVisible).toBe(true)
    expect(ui.qrUrl).toBe('https://github.com')
    expect(ui.qrTitle).toBe('GitHub')

    ui.resolveQr()

    await expect(pending).resolves.toBeUndefined()
    expect(ui.qrVisible).toBe(false)
  })

  it('toast 在 2.5 秒后自动移除', () => {
    vi.useFakeTimers()
    try {
      const ui = useUiStore()
      ui.toast('已复制')
      expect(ui.toasts).toHaveLength(1)

      vi.advanceTimersByTime(2499)
      expect(ui.toasts).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(ui.toasts).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
