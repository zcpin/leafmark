import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import OnboardingOverlay from '@/components/OnboardingOverlay.vue'
import { chromeMock } from '../mocks/chrome'

/** 冲刷 onMounted 内的 async storageGet Promise 链（宏任务） */
async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function findBtn(label: string): HTMLElement {
  const btn = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  )
  return btn as HTMLElement
}

describe('OnboardingOverlay（G1 新手引导）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('未完成引导时显示', async () => {
    const wrapper = mount(OnboardingOverlay, { attachTo: document.body })
    await flushAsync()
    expect(document.body.textContent).toContain('欢迎使用叶签')
    wrapper.unmount()
  })

  it('已完成引导时不显示', async () => {
    chromeMock.__storage.local.set('onboardingCompleted', true)
    const wrapper = mount(OnboardingOverlay, { attachTo: document.body })
    await flushAsync()
    expect(document.body.textContent).not.toContain('欢迎使用叶签')
    wrapper.unmount()
  })

  it('下一步逐步推进（3 步），最后完成并持久化', async () => {
    const wrapper = mount(OnboardingOverlay, { attachTo: document.body })
    await flushAsync()

    findBtn('下一步').click()
    await flushAsync()
    expect(document.body.textContent).toContain('悬停预览文件夹')

    findBtn('下一步').click()
    await flushAsync()
    expect(document.body.textContent).toContain('右键更多操作')

    findBtn('开始使用').click()
    await flushAsync()
    expect(chromeMock.__storage.local.get('onboardingCompleted')).toBe(true)
    expect(document.body.textContent).not.toContain('右键更多操作')
    wrapper.unmount()
  })

  it('点击跳过直接完成引导', async () => {
    const wrapper = mount(OnboardingOverlay, { attachTo: document.body })
    await flushAsync()
    findBtn('跳过').click()
    await flushAsync()
    expect(chromeMock.__storage.local.get('onboardingCompleted')).toBe(true)
    wrapper.unmount()
  })
})
