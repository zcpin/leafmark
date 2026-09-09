import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import BookmarkCard from '@/components/BookmarkCard.vue'
import type { BookmarkNode } from '@/lib/types'

vi.mock('@/lib/tabs', () => ({ openUrl: vi.fn(), openAllInGroup: vi.fn() }))

const folder: BookmarkNode = {
  id: 'outer',
  title: 'Outer',
  children: [
    {
      id: 'inner',
      parentId: 'outer',
      title: 'Inner',
      children: [{ id: 'link', parentId: 'inner', title: 'Link', url: 'https://example.test' }],
    },
  ],
}

let wrapper: VueWrapper
const panels = () => Array.from(document.body.querySelectorAll<HTMLElement>('.fixed.z-40'))
async function settle() {
  await nextTick()
  await nextTick()
}
async function openNested() {
  await wrapper.trigger('click', { button: 0 })
  await settle()
  document.body.querySelector<HTMLElement>('[aria-label="Inner"]')!.click()
  await settle()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const nested = this.getAttribute('aria-label') === 'Inner'
    return {
      x: 0,
      y: 0,
      left: nested ? 110 : 100,
      right: nested ? 260 : 300,
      top: nested ? 110 : 50,
      bottom: nested ? 158 : 98,
      width: 200,
      height: 48,
      toJSON: () => ({}),
    }
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(520)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
  wrapper = mount(BookmarkCard, { props: { node: folder }, attachTo: document.body })
})

afterEach(() => {
  wrapper.unmount()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('A9 递归面板', () => {
  it('子面板从卡片右侧展开', async () => {
    await openNested()
    expect(panels()).toHaveLength(2)
    expect(panels()[1]!.style.left).toBe('268px')
  })

  it.each(['escape', 'link'])('%s 关闭整条级联链', async (action) => {
    await openNested()
    if (action === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    else document.body.querySelector<HTMLElement>('[aria-label="Link"]')!.click()
    await settle()
    expect(panels()).toHaveLength(0)
  })

  it.each(['keydown', 'scroll'])('只有一层时也能通过 %s 关闭', async (event) => {
    await wrapper.trigger('click', { button: 0 })
    await settle()
    window.dispatchEvent(
      event === 'keydown' ? new KeyboardEvent(event, { key: 'Escape' }) : new Event(event),
    )
    await settle()
    expect(panels()).toHaveLength(0)
  })

  it('移入传送到 body 的子面板后，祖先面板保持打开', async () => {
    vi.useFakeTimers()
    await openNested()
    panels()[0]!.dispatchEvent(new MouseEvent('mouseleave'))
    panels()[1]!.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(300)
    expect(panels()).toHaveLength(2)
    panels()[1]!.dispatchEvent(new MouseEvent('mouseleave'))
    await vi.advanceTimersByTimeAsync(201)
    expect(panels()).toHaveLength(0)
  })

  it('点击链内保持打开，点击外部关闭', async () => {
    await openNested()
    panels()[1]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(panels()).toHaveLength(2)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(panels()).toHaveLength(0)
  })

  it('一千个子书签按页展示，翻页后可以访问后续条目', async () => {
    await wrapper.setProps({
      node: {
        id: 'large',
        title: 'Large',
        children: Array.from({ length: 1000 }, (_, index) => ({
          id: `item-${index}`,
          title: `Item ${index}`,
          url: `https://example.test/${index}`,
        })),
      },
    })
    await wrapper.trigger('click', { button: 0 })
    await settle()
    const firstPage = panels()[0]!.querySelectorAll('.bookmark-card')
    expect(firstPage.length).toBeGreaterThan(1)
    expect(firstPage.length).toBeLessThanOrEqual(36)
    expect(firstPage[0]!.getAttribute('aria-label')).toBe('Item 0')
    panels()[0]!.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click()
    await settle()
    expect(panels()[0]!.querySelector('.bookmark-card')!.getAttribute('aria-label')).toBe(
      `Item ${firstPage.length}`,
    )
    panels()[0]!.querySelector<HTMLButtonElement>('[aria-label="上一页"]')!.click()
    await settle()
    expect(panels()[0]!.querySelector('.bookmark-card')!.getAttribute('aria-label')).toBe('Item 0')
  })
})
