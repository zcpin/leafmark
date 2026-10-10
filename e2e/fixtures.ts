// 真实浏览器下的扩展 e2e：以解压目录加载 dist，操作 chrome.bookmarks 本身。
//
// 关键约束：
// 1. 必须使用 launchPersistentContext —— 只有持久化上下文才能加载扩展。
// 2. 必须使用 channel: 'chromium' —— Playwright 默认的 headless shell 不支持扩展。
// 3. 扩展没有 background service worker，拿不到 context.serviceWorkers()，
//    改为直接 goto('chrome://newtab')：newtab 覆盖会把地址重定向到 chrome-extension://<id>/...。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test'

export const EXTENSION_PATH = process.env.LEAFMARK_DIST
  ? path.resolve(process.env.LEAFMARK_DIST)
  : path.resolve(process.cwd(), 'dist')

export interface SeedNode {
  title: string
  url?: string
  children?: SeedNode[]
}

export const test = base.extend<{ context: BrowserContext; newtab: Page }>({
  // 空解构＝不依赖任何内置 fixture，避免 Playwright 额外拉起默认浏览器
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const manifest = path.join(EXTENSION_PATH, 'manifest.json')
    if (!fs.existsSync(manifest)) {
      throw new Error(`找不到构建产物 ${manifest}，请先运行 pnpm build`)
    }
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leafmark-e2e-'))
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    })
    await use(context)
    await context.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  newtab: async ({ context }, use) => {
    const page = await context.newPage()
    await page.goto('chrome://newtab')
    await expect(page).toHaveURL(/^chrome-extension:\/\//)
    await dismissOnboarding(page)
    await use(page)
  },
})

/** 新手引导只在首次显示，点第一个按钮（Skip）关闭并写入完成态 */
export async function dismissOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  if (!(await dialog.isVisible())) return
  await dialog.getByRole('button').first().click()
  await expect(dialog).toBeHidden()
}

export function card(page: Page, title: string) {
  return page.locator(`.bookmark-card[aria-label="${title}"]`)
}

/** 清空书签栏与其他书签，保证每个用例从同一状态出发 */
export async function resetBookmarks(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const clear = async (id: string) => {
      for (const child of await chrome.bookmarks.getChildren(id)) {
        await chrome.bookmarks.removeTree(child.id)
      }
    }
    await clear('1')
    await clear('2')
  })
}

/** 用真实 API 播种书签，返回根节点的 id */
export async function seed(page: Page, node: SeedNode, parentId = '1'): Promise<string> {
  return page.evaluate(
    async ([spec, parent]: [SeedNode, string]) => {
      const create = async (node: SeedNode, parentId: string): Promise<string> => {
        const created = await chrome.bookmarks.create({
          parentId,
          title: node.title,
          ...(node.url ? { url: node.url } : {}),
        })
        for (const child of node.children ?? []) await create(child, created.id)
        return created.id
      }
      return create(spec, parent)
    },
    [node, parentId] as [SeedNode, string],
  )
}

export async function childrenOf(
  page: Page,
  parentId: string,
): Promise<{ id: string; title: string; url?: string }[]> {
  return page.evaluate(
    (id) =>
      chrome.bookmarks
        .getChildren(id)
        .then((nodes) => nodes.map((node) => ({ id: node.id, title: node.title, url: node.url }))),
    parentId,
  )
}

/** 右键卡片并从右键菜单选择一项（按可访问名称，界面语言由 config 固定为 en-US） */
export async function menuAction(page: Page, title: string, label: string): Promise<void> {
  await card(page, title).click({ button: 'right' })
  await page.getByRole('menu').getByRole('menuitem', { name: label, exact: true }).click()
}
