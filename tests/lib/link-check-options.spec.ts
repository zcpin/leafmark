import { describe, expect, it } from 'vitest'
import { isIgnoredUrl, normalizeIgnoredDomain, scopedCheckTargets } from '@/lib/link-check-options'
import { SAMPLE_TREE } from '../mocks/chrome'

describe('检测范围与忽略域名', () => {
  it('目录检测包含子目录，并保留完整位置', () => {
    const selected = scopedCheckTargets(SAMPLE_TREE, { folderId: '102', ignoredDomains: [] })
    expect(selected.valid).toBe(true)
    expect(selected.targets.map((target) => target.url)).toEqual(['https://vuejs.org'])
    expect(selected.targets[0]?.folder).toContain('开发 / 前端')
  })
  it('失效目录返回空范围，不能退回全部书签', () => {
    const selected = scopedCheckTargets(SAMPLE_TREE, { folderId: 'missing', ignoredDomains: [] })
    expect(selected.valid).toBe(false)
    expect(selected.targets).toEqual([])
  })
  it('域名与子域名匹配，但不会误匹配相似后缀', () => {
    expect(isIgnoredUrl('https://example.com/a', ['example.com'])).toBe(true)
    expect(isIgnoredUrl('https://login.example.com/a', ['example.com'])).toBe(true)
    expect(isIgnoredUrl('https://notexample.com', ['example.com'])).toBe(false)
    expect(isIgnoredUrl('https://example.com.evil.test', ['example.com'])).toBe(false)
  })
  it('规范化域名、端口和网站地址，拒绝凭据或无效输入', () => {
    expect(normalizeIgnoredDomain('*.Example.COM')).toBe('example.com')
    expect(normalizeIgnoredDomain('http://localhost:8080/login')).toBe('localhost')
    expect(normalizeIgnoredDomain('https://example.com./')).toBe('example.com')
    expect(normalizeIgnoredDomain('https://user:pass@example.com')).toBeNull()
    expect(normalizeIgnoredDomain('bad input')).toBeNull()
    expect(normalizeIgnoredDomain('*')).toBeNull()
  })
})
