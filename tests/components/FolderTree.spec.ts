import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import FolderTree from '@/components/FolderTree.vue'
import { useBookmarksStore } from '@/stores/bookmarks'

describe('FolderTree（A5 侧栏树）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function mountTree() {
    const bookmarks = useBookmarksStore()
    await bookmarks.init()
    const wrapper = mount(FolderTree, {
      global: { plugins: [] },
    })
    return { wrapper, bookmarks }
  }

  it('渲染整棵树（含根/书签栏/嵌套节点）', async () => {
    const { wrapper } = await mountTree()
    const buttons = wrapper.findAll('button')
    const titles = buttons.map((b) => b.text())
    expect(titles).toContain('书签栏')
    expect(titles).toContain('其他书签')
    expect(titles).toContain('开发')
    expect(titles).toContain('前端')
  })

  it('点击节点切换主视图', async () => {
    const { wrapper, bookmarks } = await mountTree()
    const devRow = wrapper.findAll('button').find((b) => b.text() === '开发')
    expect(devRow).toBeDefined()
    await devRow!.trigger('click')
    expect(bookmarks.viewFolderId).toBe('10')
    expect(bookmarks.currentFolder?.id).toBe('10')
  })

  it('当前视图节点高亮', async () => {
    const { wrapper, bookmarks } = await mountTree()
    bookmarks.setViewFolder('10')
    await nextTick()
    const devRow = wrapper.findAll('button').find((b) => b.text() === '开发')
    expect(devRow!.classes()).toContain('bg-emerald-500/15')
  })
})
