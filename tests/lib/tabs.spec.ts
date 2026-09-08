import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openAllInGroup, openUrl } from '@/lib/tabs'
import { chromeMock } from '../mocks/chrome'

describe('tabs（B3 批量打开 + 分组）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chromeMock.__reset()
  })

  it('openAllInGroup 逐个创建标签页', async () => {
    await openAllInGroup(['https://a.com', 'https://b.com', 'https://c.com'], '开发')
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(3)
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      { url: 'https://a.com', active: false },
      expect.any(Function),
    )
  })

  it('多个 URL → 调用 tabs.group + tabGroups.update 设置组名颜色', async () => {
    await openAllInGroup(['https://a.com', 'https://b.com'], '开发')
    expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] }, expect.any(Function))
    expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
      1002,
      { title: '开发', color: 'cyan' },
      expect.any(Function),
    )
    expect(chromeMock.tabGroups.__get(1002)).toEqual({ title: '开发', color: 'cyan' })
  })

  it('单个 URL 不创建分组', async () => {
    await openAllInGroup(['https://a.com'], '开发')
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1)
    expect(chromeMock.tabs.group).not.toHaveBeenCalled()
  })

  it('空 URL 列表直接返回', async () => {
    await openAllInGroup([], '开发')
    expect(chromeMock.tabs.create).not.toHaveBeenCalled()
  })

  it('过滤掉空 URL', async () => {
    await openAllInGroup(['https://a.com', '', 'https://b.com'], '开发')
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(2)
  })

  it('openUrl 新标签页模式调用 tabs.create', () => {
    openUrl('https://a.com', true)
    expect(chromeMock.tabs.create).toHaveBeenCalledWith(
      { url: 'https://a.com', active: true },
      expect.any(Function),
    )
  })

  it('openUrl 当前页模式调用 location.assign', () => {
    const spy = vi.spyOn(location, 'assign').mockImplementation(() => {})
    openUrl('https://a.com', false)
    expect(spy).toHaveBeenCalledWith('https://a.com')
    spy.mockRestore()
  })

  it('快捷打开可以创建不抢焦点的后台标签页', () => {
    openUrl('https://a.com', true, false)
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://a.com', active: false }, expect.any(Function))
  })

  it('批量创建标签页遇到 runtime.lastError 时跳过失败项，不进入空分组', async () => {
    chromeMock.runtime.lastError = { message: 'tabs unavailable' }
    try {
      await expect(
        openAllInGroup(['https://a.com', 'https://b.com'], '开发'),
      ).resolves.toBeUndefined()
      expect(chromeMock.tabs.group).not.toHaveBeenCalled()
    } finally {
      chromeMock.runtime.lastError = null
    }
  })
})
