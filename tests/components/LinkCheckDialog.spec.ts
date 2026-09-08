import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import LinkCheckDialog from '@/components/LinkCheckDialog.vue'
import { scanLinks } from '@/lib/link-checker'
import { requestLinkCheckAccess } from '@/lib/link-check-permissions'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { chromeMock } from '../mocks/chrome'

vi.mock('@/lib/link-check-permissions', () => ({ supportsLinkCheck: () => true, requestLinkCheckAccess: vi.fn() }))
vi.mock('@/lib/link-checker', async (original) => ({ ...await original<typeof import('@/lib/link-checker')>(), scanLinks: vi.fn() }))

function buttonWithin(root: Element, label: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim().startsWith(label))
  expect(button).toBeDefined()
  return button!
}

beforeEach(async () => {
  setActivePinia(createPinia())
  chromeMock.__reset()
  vi.mocked(requestLinkCheckAccess).mockResolvedValue(true)
  vi.mocked(scanLinks).mockImplementation(async (targets, _timeout, _signal, onResults) => {
    onResults(targets.map((target) => ({ ...target, status: target.id === '100' ? 'timeout' : target.id === '101' ? 'restricted' : 'ok' })))
  })
  await Promise.all([useSettingsStore().init(), useBookmarksStore().init()])
})

describe('链接检测面板', () => {
  it('范围与忽略名单生效前禁用开始，保存后只保留范围内允许的地址', async () => {
    const wrapper = mount(LinkCheckDialog)
    const checker = useLinkCheckerStore()
    try {
      checker.show()
      await nextTick()
      const panel = document.body.querySelector('[role="dialog"]')!
      const scope = panel.querySelector<HTMLSelectElement>('select')!
      scope.value = '102'
      scope.dispatchEvent(new Event('change'))
      await vi.waitFor(() => expect(checker.targets.map((link) => link.url)).toEqual(['https://vuejs.org']))
      panel.querySelector('details')!.open = true
      const ignored = panel.querySelector('textarea')!
      ignored.value = 'vuejs.org'
      ignored.dispatchEvent(new Event('input'))
      await nextTick()
      expect(buttonWithin(panel, '开始检测').disabled).toBe(true)
      await vi.waitFor(() => expect(buttonWithin(panel, '保存忽略名单').disabled).toBe(false))
      buttonWithin(panel, '保存忽略名单').click()
      await vi.waitFor(() => expect(checker.targets).toHaveLength(0))
      expect(checker.ignoredCount).toBe(1)
      expect(requestLinkCheckAccess).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      useSettingsStore().dispose()
      useBookmarksStore().dispose()
    }
  })

  it('保存超时、区分受限链接，只有确认后才删除勾选的超时书签', async () => {
    const wrapper = mount(LinkCheckDialog)
    const confirmation = mount(ConfirmDialog)
    const checker = useLinkCheckerStore()
    try {
      checker.show()
      await nextTick()
      const panel = document.body.querySelector('[role="dialog"]')!
      const input = panel.querySelector<HTMLInputElement>('input[type="number"]')!
      input.value = '3'
      input.dispatchEvent(new Event('input'))
      input.dispatchEvent(new Event('change'))
      await vi.waitFor(() => expect(chromeMock.__storage.sync.get('linkCheckTimeout')).toBe(3))

      buttonWithin(panel, '开始检测').click()
      await vi.waitFor(() => expect(checker.phase).toBe('done'))
      expect(panel.querySelectorAll('li')).toHaveLength(1)
      expect(panel.querySelector('li')?.textContent).toContain('超时')
      expect(panel.textContent).toContain('需要确认 1')
      expect(checker.selectedIds).toEqual([])

      panel.querySelector<HTMLInputElement>('li input[type="checkbox"]')!.click()
      await nextTick()
      buttonWithin(panel, '删除所选').click()
      await nextTick()
      expect(useUiStore().confirmVisible).toBe(true)
      expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
      const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === '删除')!
      confirm.click()
      await vi.waitFor(() => expect(chromeMock.bookmarks.__find('100')).toBeUndefined())
      expect(chromeMock.bookmarks.__find('101')).toBeDefined()
    } finally {
      wrapper.unmount()
      confirmation.unmount()
      useSettingsStore().dispose()
      useBookmarksStore().dispose()
    }
  })

  it('权限被拒绝时在面板内显示错误提示', async () => {
    vi.mocked(requestLinkCheckAccess).mockResolvedValue(false)
    const wrapper = mount(LinkCheckDialog)
    try {
      useLinkCheckerStore().show()
      await nextTick()
      const panel = document.body.querySelector('[role="dialog"]')!
      buttonWithin(panel, '开始检测').click()
      await vi.waitFor(() => expect(panel.querySelector('[role="alert"]')?.textContent).toContain('未获得网站访问权限'))
    } finally {
      wrapper.unmount()
      useSettingsStore().dispose()
      useBookmarksStore().dispose()
    }
  })
})
