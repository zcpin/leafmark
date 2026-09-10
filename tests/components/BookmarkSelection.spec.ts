import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import App from '@/newtab/App.vue'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSelectionStore } from '@/stores/selection'
import { chromeMock } from '../mocks/chrome'

const tree: BookmarkNode[] = [{ id: '0', title: '', children: [
  { id: '1', parentId: '0', title: '书签栏', children: [
    { id: 'a', parentId: '1', title: 'Alpha', url: 'https://a.test' },
    { id: 'b', parentId: '1', title: 'Beta', url: 'https://b.test' },
    { id: 'f', parentId: '1', title: 'Folder', children: [
      { id: 'c', parentId: 'f', title: 'Child', url: 'https://c.test' },
      { id: 'nested', parentId: 'f', title: 'Nested', children: [] },
    ] },
  ] },
  { id: '2', parentId: '0', title: '其他书签', children: [] },
] }]

let wrapper: VueWrapper
const button = (label: string, root: ParentNode = document.body) => {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === label)
  expect(found, `button: ${label}`).toBeDefined()
  return found!
}
const card = (label: string) => wrapper.get(`.bookmark-card[aria-label="${label}"]`)
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const chooseOther = async () => {
  const radio = dialog().querySelector<HTMLInputElement>('input[aria-label="其他书签"]')!
  radio.click()
  await nextTick()
}

beforeEach(async () => {
  setActivePinia(createPinia())
  chromeMock.bookmarks.__setTree(tree)
  wrapper = mount(App, { attachTo: document.body, global: { stubs: {
    Clock: true, YearProgress: true, OnboardingOverlay: true, SettingsPanel: true,
    LinkCheckDialog: true, DuplicateDialog: true, QrCodeDialog: true,
  } } })
  await vi.waitFor(() => expect(wrapper.findAll('.bookmark-card')).toHaveLength(3))
})

afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
})

describe('多选与批量移动交互', () => {
  it('显式进入多选；点击和键盘切换勾选，中键不会打开书签', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    expect(card('Alpha').attributes('role')).toBe('checkbox')
    await card('Alpha').trigger('click', { ctrlKey: true })
    expect(card('Alpha').attributes('aria-checked')).toBe('true')
    await card('Beta').trigger('auxclick', { button: 1 })
    expect(chromeMock.tabs.create).not.toHaveBeenCalled()
    expect(card('Beta').attributes('aria-checked')).toBe('false')
    await card('Alpha').trigger('keydown', { key: ' ' })
    expect(card('Alpha').attributes('aria-checked')).toBe('false')
    await card('Beta').trigger('keydown', { key: 'Enter' })
    expect(card('Beta').attributes('aria-checked')).toBe('true')
    await card('Folder').trigger('click')
    expect(card('Folder').attributes('aria-checked')).toBe('true')
    expect(document.querySelector('[data-popup-chain].z-40')).toBeNull()
  })

  it('Shift 连选、取消全选、Ctrl+A 和 Esc 都局限于多选模式', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    await card('Folder').trigger('click', { shiftKey: true })
    expect(wrapper.text()).toContain('已选 3 项')
    button('取消全选').click()
    await nextTick()
    expect(wrapper.text()).toContain('已选 0 项')
    expect(button('移动到…').disabled).toBe(true)
    await card('Beta').trigger('keydown', { key: 'a', ctrlKey: true })
    expect(wrapper.text()).toContain('已选 3 项')
    await card('Beta').trigger('keydown', { key: 'Escape' })
    expect(card('Beta').attributes('role')).toBe('link')
    expect(wrapper.find('#bookmark-selection-toolbar').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[aria-label="多选"]').element)
  })

  it('原目录、自身和子目录禁选；按页面顺序移动书签和完整文件夹', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Folder').trigger('click')
    await card('Alpha').trigger('click')
    button('移动到…').click()
    await nextTick()
    for (const path of ['书签栏', '书签栏 / Folder', '书签栏 / Folder / Nested']) {
      expect(dialog().querySelector<HTMLInputElement>(`input[aria-label="${path}"]`)?.disabled).toBe(true)
    }
    expect(button('移动 2 项到此处').disabled).toBe(true)
    await chooseOther()
    button('移动 2 项到此处').click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(chromeMock.bookmarks.__find('2')?.children?.map((node) => node.id)).toEqual(['a', 'f'])
    expect(chromeMock.bookmarks.__find('c')?.parentId).toBe('f')
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(1)
    expect(card('Beta').attributes('role')).toBe('link')
    expect(chromeMock.tabs.create).not.toHaveBeenCalled()
  })

  it('部分失败保留失败项并可重试，不重复移动已成功的书签', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    await card('Beta').trigger('click')
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    chromeMock.bookmarks.move.mockImplementationOnce((_id, _destination, callback) => {
      chromeMock.runtime.lastError = { message: 'temporary failure' }
      callback(undefined as unknown as BookmarkNode)
      chromeMock.runtime.lastError = null
    })
    button('移动 2 项到此处').click()
    await vi.waitFor(() => expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('另有 1 项移动失败'))
    expect(card('Alpha').attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.bookmark-card[aria-label="Beta"]').exists()).toBe(false)
    button('移动 1 项到此处').click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(chromeMock.bookmarks.move.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'a'])
  })

  it('全部移出后焦点返回入口，空目录不能重新进入多选', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    button('全选').click()
    await nextTick()
    button('移动到…').focus()
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    button('移动 3 项到此处').click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    const entry = wrapper.get('[aria-label="多选"]')
    expect(wrapper.findAll('.bookmark-card')).toHaveLength(0)
    expect(document.activeElement).toBe(entry.element)
    expect(entry.attributes('aria-disabled')).toBe('true')
    await entry.trigger('click')
    expect(wrapper.find('#bookmark-selection-toolbar').exists()).toBe(false)
  })

  it('进行中的批次禁止重复提交和关闭，完成后解除限制', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    const original = chromeMock.bookmarks.move.getMockImplementation()!
    let finish: (() => void) | undefined
    chromeMock.bookmarks.move.mockImplementationOnce((id, destination, callback) => {
      finish = () => original(id, destination, callback)
    })
    const submit = button('移动 1 项到此处')
    submit.click()
    submit.click()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(button('取消').disabled).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(dialog()).not.toBeNull()
    expect(chromeMock.bookmarks.move).toHaveBeenCalledTimes(1)
    finish!()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(wrapper.get('[aria-label="多选"]').attributes('disabled')).toBeUndefined()
  })

  it('打开窗口后源项目消失，停止提交并允许取消', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    chromeMock.bookmarks.remove('a', () => {})
    await vi.waitFor(() => expect(dialog().textContent).toContain('所选项目已不在当前目录'))
    expect(button('移动 0 项到此处').disabled).toBe(true)
    button('取消').click()
    await nextTick()
    expect(dialog()).toBeNull()
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('确认前目标目录被移除，不能继续提交旧目标', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    chromeMock.bookmarks.removeTree('2', () => {})
    await vi.waitFor(() => expect(dialog().querySelector('input[aria-label="其他书签"]')).toBeNull())
    expect(button('移动 1 项到此处').disabled).toBe(true)
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('从悬停面板右键多选会展示该目录，切换目录则清空选择', async () => {
    await card('Folder').trigger('click')
    await nextTick()
    const child = document.querySelector<HTMLElement>('.bookmark-card[aria-label="Child"]')!
    child.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await nextTick()
    const select = Array.from(document.querySelectorAll<HTMLButtonElement>('.glass-strong button')).find((item) => item.textContent?.trim() === '多选')!
    expect(select).toBeDefined()
    select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(select.isConnected).toBe(true)
    select.click()
    await nextTick()
    expect(useBookmarksStore().currentFolder?.id).toBe('f')
    expect(card('Child').attributes('aria-checked')).toBe('true')
    expect(useSelectionStore().selected.map((node) => node.id)).toEqual(['c'])
    useBookmarksStore().setViewFolder('1')
    await nextTick()
    expect(wrapper.find('#bookmark-selection-toolbar').exists()).toBe(false)
  })

  it('目标读取失败时显示可重试错误，关闭窗口保留当前选择', async () => {
    await wrapper.get('[aria-label="多选"]').trigger('click')
    await card('Alpha').trigger('click')
    button('移动到…').click()
    await nextTick()
    await chooseOther()
    chromeMock.bookmarks.getTree.mockImplementationOnce((callback) => {
      chromeMock.runtime.lastError = { message: 'read failed' }
      callback([])
      chromeMock.runtime.lastError = null
    })
    button('移动 1 项到此处').click()
    await vi.waitFor(() => expect(dialog().textContent).toContain('未能完成移动'))
    button('取消').click()
    await nextTick()
    expect(card('Alpha').attributes('aria-checked')).toBe('true')
    button('完成').click()
    await nextTick()
    expect(card('Alpha').attributes('role')).toBe('link')
  })
})
