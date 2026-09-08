import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { scanLinks } from '@/lib/link-checker'
import { requestLinkCheckAccess, supportsLinkCheck } from '@/lib/link-check-permissions'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { chromeMock } from '../mocks/chrome'

vi.mock('@/lib/link-check-permissions', () => ({ requestLinkCheckAccess: vi.fn(), supportsLinkCheck: vi.fn() }))
vi.mock('@/lib/link-checker', async (original) => ({ ...await original<typeof import('@/lib/link-checker')>(), scanLinks: vi.fn() }))

beforeEach(async () => {
  setActivePinia(createPinia())
  chromeMock.__reset()
  vi.mocked(supportsLinkCheck).mockReturnValue(true)
  vi.mocked(requestLinkCheckAccess).mockReset().mockResolvedValue(true)
  vi.mocked(scanLinks).mockReset().mockImplementation(async (targets, _timeout, _signal, onResults) => {
    onResults(targets.map((target) => ({ ...target, status: 'http-error', httpStatus: 404 })))
  })
  await useBookmarksStore().load()
  await useSettingsStore().init()
})

describe('链接检测任务', () => {
  it('配置载入前不扫描，避免使用临时的全部范围', async () => {
    useSettingsStore().dispose()
    await useLinkCheckerStore().start()
    expect(scanLinks).not.toHaveBeenCalled()
    expect(requestLinkCheckAccess).not.toHaveBeenCalled()
  })

  it('只扫描所选目录中未被忽略的地址', async () => {
    await useSettingsStore().setLinkCheckOptions({ folderId: '10', ignoredDomains: ['github.com', 'mozilla.org'] })
    const checker = useLinkCheckerStore()
    expect(checker.ignoredCount).toBe(2)
    await checker.start()
    expect(vi.mocked(scanLinks).mock.calls[0]?.[0].map((target) => target.url)).toEqual(['https://vuejs.org'])
  })

  it('修改范围会使等待中的授权失效，避免继续扫描旧范围', async () => {
    let grant: ((allowed: boolean) => void) | undefined
    vi.mocked(requestLinkCheckAccess).mockImplementation(() => new Promise((resolve) => { grant = resolve }))
    const checker = useLinkCheckerStore()
    const pending = checker.start()
    await useSettingsStore().setLinkCheckOptions({ folderId: '102' })
    grant?.(true)
    await pending
    expect(scanLinks).not.toHaveBeenCalled()
    expect(checker.results).toEqual([])
  })

  it('拒绝授权后不请求网址，并显示说明', async () => {
    vi.mocked(requestLinkCheckAccess).mockResolvedValue(false)
    const checker = useLinkCheckerStore()
    await checker.start()
    expect(scanLinks).not.toHaveBeenCalled()
    expect(checker.error).toContain('未获得网站访问权限')
    expect(checker.busy).toBe(false)
  })

  it('授权期间关闭面板，迟到的授权结果不会启动扫描', async () => {
    let grant: ((allowed: boolean) => void) | undefined
    vi.mocked(requestLinkCheckAccess).mockImplementation(() => new Promise((resolve) => { grant = resolve }))
    const checker = useLinkCheckerStore()
    checker.show()
    const pending = checker.start()
    checker.hide()
    grant?.(true)
    await pending
    expect(scanLinks).not.toHaveBeenCalled()
    expect(checker.open).toBe(false)
    expect(checker.busy).toBe(false)
  })

  it('使用当前输入的超时，完成后列出结果但不自动删除', async () => {
    const checker = useLinkCheckerStore()
    await checker.start(undefined, 3)
    expect(vi.mocked(scanLinks).mock.calls[0]?.[1]).toBe(3)
    expect(checker.phase).toBe('done')
    expect(checker.completed).toBe(checker.targets.length)
    expect(checker.failed.length).toBe(checker.targets.length)
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    expect(checker.selectedIds).toEqual([])
  })

  it('取消删除确认后不修改任何书签', async () => {
    const checker = useLinkCheckerStore()
    await checker.start()
    checker.selectedIds = ['100']
    vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(false)
    await checker.deleteSelected()
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    expect(checker.selectedIds).toEqual(['100'])
  })

  it('确认期间链接被改成新地址，旧检测结果不能删除它', async () => {
    const checker = useLinkCheckerStore()
    await checker.start()
    checker.selectedIds = ['100']
    vi.spyOn(useUiStore(), 'confirm').mockImplementation(async () => {
      chromeMock.bookmarks.update('100', { url: 'https://new-address.test' }, () => {})
      return true
    })
    await checker.deleteSelected()
    expect(chromeMock.bookmarks.remove).not.toHaveBeenCalled()
    expect(chromeMock.bookmarks.__find('100')?.url).toBe('https://new-address.test')
  })

  it('删除部分失败时保留失败项，只删除确认选中的普通书签', async () => {
    const checker = useLinkCheckerStore()
    await checker.start()
    checker.selectedIds = ['100', '101']
    vi.spyOn(useUiStore(), 'confirm').mockResolvedValue(true)
    chromeMock.bookmarks.remove.mockImplementationOnce((_id, callback) => {
      chromeMock.runtime.lastError = { message: 'remove failed' }
      callback()
      chromeMock.runtime.lastError = null
    })
    await checker.deleteSelected()
    expect(chromeMock.bookmarks.__find('100')).toBeDefined()
    expect(chromeMock.bookmarks.__find('101')).toBeUndefined()
    expect(chromeMock.bookmarks.removeTree).not.toHaveBeenCalled()
    expect(checker.selectedIds).toEqual(['100'])
    expect(checker.results.some((result) => result.id === '101')).toBe(false)
    expect(useUiStore().toasts.at(-1)?.message).toContain('已删除 1 个书签，保留 1 个')
  })
})
