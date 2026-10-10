import { defineConfig } from '@playwright/test'

// 真实浏览器 + 真实 chrome.bookmarks 的端到端回归。
// 前置条件：先 pnpm build（fixture 会加载 dist 作为解压扩展）。
export default defineConfig({
  testDir: './e2e',
  // 每个用例独占一个持久化 profile，且书签 API 是共享的真实状态
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: 'artifacts/e2e-results',
  use: {
    // 固定界面语言，选择器不随系统语言漂移（扩展 default_locale 为 en）
    locale: 'en-US',
  },
})
