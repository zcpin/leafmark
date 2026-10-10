import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import RecycleBinButton from '@/components/RecycleBinButton.vue'
import { t } from '@/lib/i18n'
import type { DeletionRecord } from '@/lib/deletion-bin'
import { useDeletionsStore } from '@/stores/deletions'
import { chromeMock } from '../mocks/chrome'

beforeEach(() => {
  setActivePinia(createPinia())
  chromeMock.__reset()
})

function seed(records: DeletionRecord[]) {
  chromeMock.__storage.local.set('bookmarkUndo', { version: 2, records })
}

function entry(id: string) {
  return { parentId: '10', index: 0, node: { id, title: id, url: `https://${id}.test` } }
}

/** 组件挂载时自己发起 init，再 await 一次可拿到同一个 promise（内部有记忆化） */
async function mountButton() {
  const wrapper = mount(RecycleBinButton)
  await useDeletionsStore().init()
  await flushPromises()
  return wrapper
}

describe('RecycleBinButton', () => {
  it('回收站为空时不渲染', async () => {
    const wrapper = await mountButton()
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('显示所有批次的条目总数，而不只是最近一批', async () => {
    seed([
      { id: 'a', entries: [entry('901')] },
      { id: 'b', entries: [entry('902'), entry('903')] },
    ])
    const wrapper = await mountButton()
    expect(wrapper.find('button').text()).toBe(t('recycleBin', { n: 3 }))
    expect(useDeletionsStore().depth).toBe(2)
    wrapper.unmount()
  })

  it('点击打开回收站面板', async () => {
    seed([{ id: 'a', entries: [entry('901')] }])
    const wrapper = await mountButton()
    await wrapper.find('button').trigger('click')
    expect(useDeletionsStore().binOpen).toBe(true)
    wrapper.unmount()
  })
})
