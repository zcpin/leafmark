import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import UndoDeleteButton from '@/components/UndoDeleteButton.vue'
import { t } from '@/lib/i18n'
import type { UndoRecord } from '@/lib/bookmark-undo'
import { useDeletionsStore } from '@/stores/deletions'
import { chromeMock } from '../mocks/chrome'

beforeEach(() => {
  setActivePinia(createPinia())
  chromeMock.__reset()
})

function seed(records: UndoRecord[]) {
  chromeMock.__storage.local.set('bookmarkUndo', { version: 2, records })
}

function entry(id: string) {
  return { parentId: '10', index: 0, node: { id, title: id, url: `https://${id}.test` } }
}

/** 组件挂载时自己发起 init，再await一次可拿到同一个 promise（内部有记忆化） */
async function mountButton() {
  const wrapper = mount(UndoDeleteButton)
  await useDeletionsStore().init()
  await flushPromises()
  return wrapper
}

describe('UndoDeleteButton', () => {
  it('没有待撤销记录时不渲染', async () => {
    const wrapper = await mountButton()
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('只显示栈顶那一批的数量，并提示还有更早的批次', async () => {
    seed([
      { id: 'a', entries: [entry('901')] },
      { id: 'b', entries: [entry('902')] },
    ])
    const wrapper = await mountButton()
    expect(wrapper.find('button').text()).toBe(t('undoDelete', { n: 1 }))
    expect(wrapper.find('button').attributes('title')).toBe(t('undoMoreHint', { n: 1 }))
    expect(useDeletionsStore().undoDepth).toBe(2)
    wrapper.unmount()
  })

  it('只有一批时不显示更多提示', async () => {
    seed([{ id: 'a', entries: [entry('901')] }])
    const wrapper = await mountButton()
    expect(wrapper.find('button').attributes('title')).toBeUndefined()
    wrapper.unmount()
  })
})
