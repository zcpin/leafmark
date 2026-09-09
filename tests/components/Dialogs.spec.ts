import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EditBookmarkDialog from '@/components/EditBookmarkDialog.vue'
import LinkCheckDialog from '@/components/LinkCheckDialog.vue'
import QrCodeDialog from '@/components/QrCodeDialog.vue'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useUiStore } from '@/stores/ui'

vi.mock('@/lib/qrcode', () => ({
  generateQrDataUrl: vi.fn().mockResolvedValue('data:image/png,test'),
  downloadQr: vi.fn(),
}))

const wrappers: VueWrapper[] = []
let opener: HTMLButtonElement
async function settle() {
  await nextTick()
  await nextTick()
}
const key = (value: string, shiftKey = false) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }),
  )

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return (this.hidden ? [] : [new DOMRect(0, 0, 100, 30)]) as unknown as DOMRectList
  })
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  opener.remove()
  vi.restoreAllMocks()
})

describe('对话框键盘和焦点', () => {
  it('确认框有名称，默认聚焦取消，Tab 循环且 Esc 取消后归还焦点', async () => {
    wrappers.push(mount(ConfirmDialog, { attachTo: document.body }))
    await settle()
    const pending = useUiStore().confirm({ title: '确认删除', message: '测试书签' })
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain(
      '确认删除',
    )
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button')
    expect(document.activeElement).toBe(buttons[0])
    key('Tab', true)
    expect(document.activeElement).toBe(buttons[1])
    key('Tab')
    expect(document.activeElement).toBe(buttons[0])
    opener.focus()
    expect(dialog.contains(document.activeElement)).toBe(true)
    key('Escape')
    expect(await pending).toBe(false)
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it('确认框确认按钮仍返回 true', async () => {
    wrappers.push(mount(ConfirmDialog, { attachTo: document.body }))
    const pending = useUiStore().confirm({ title: '确认删除', message: '测试' })
    await settle()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
    buttons[buttons.length - 1]!.click()
    expect(await pending).toBe(true)
  })

  it('嵌套确认框只关闭顶层，焦点返回检测面板', async () => {
    wrappers.push(
      mount(LinkCheckDialog, { attachTo: document.body }),
      mount(ConfirmDialog, { attachTo: document.body }),
    )
    const checker = useLinkCheckerStore()
    checker.show()
    await settle()
    const parent = document.querySelector<HTMLElement>('[role="dialog"]')!
    const previous = document.activeElement
    const pending = useUiStore().confirm({ title: '确认删除', message: '测试' })
    await settle()
    key('Escape')
    expect(await pending).toBe(false)
    await settle()
    expect(checker.open).toBe(true)
    expect(parent.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(previous)
    key('Escape')
    await settle()
    expect(checker.open).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('编辑框自动聚焦名称，Esc 取消且不改数据', async () => {
    wrappers.push(mount(EditBookmarkDialog, { attachTo: document.body }))
    const pending = useUiStore().openEdit({
      id: '100',
      title: '原名称',
      url: 'https://example.test',
      isFolder: false,
    })
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(document.activeElement).toBe(dialog.querySelector('input'))
    key('Escape')
    expect(await pending).toBeNull()
    await settle()
    expect(document.activeElement).toBe(opener)
  })

  it('二维码有可访问的关闭入口', async () => {
    wrappers.push(mount(QrCodeDialog, { attachTo: document.body }))
    const pending = useUiStore().openQr('https://example.test', 'Example')
    await settle()
    const close = document.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="关闭"]')!
    expect(close).not.toBeNull()
    close.click()
    await pending
    await settle()
    expect(document.activeElement).toBe(opener)
  })
})
