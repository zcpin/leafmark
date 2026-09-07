import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Clock from '@/components/Clock.vue'

describe('Clock（F7 时钟）', () => {
  it('渲染非空时间与日期文本', () => {
    const wrapper = mount(Clock, { props: { now: new Date(2026, 8, 7, 10, 19) } })
    const text = wrapper.text()
    // 时间至少含数字（时分），日期为长格式
    expect(text).toMatch(/\d/)
    wrapper.unmount()
  })

  it('时间格式为 时分（含冒号或 AM/PM）', async () => {
    const wrapper = mount(Clock, { props: { now: new Date(2026, 8, 7, 10, 19) } })
    const timeEl = wrapper.find('time')
    expect(timeEl.text()).toMatch(/^(\d{1,2}:\d{2}|\d{1,2}:\d{2} (AM|PM))$/)
    wrapper.unmount()
  })
})
