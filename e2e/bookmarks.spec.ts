// 真实浏览器 + 真实 chrome.bookmarks 的主链路回归。
// 界面语言由 playwright.config.ts 固定为 en-US，选择器按英文文案定位。
import { expect } from '@playwright/test'

import { card, childrenOf, menuAction, resetBookmarks, seed, test } from './fixtures'

test.beforeEach(async ({ newtab }) => {
  await resetBookmarks(newtab)
})

/** Chrome 会把 https://x.test 规范化为 https://x.test/，比较前去掉尾斜杠 */
async function urlsOf(page: Parameters<typeof childrenOf>[0], parentId: string) {
  return (await childrenOf(page, parentId)).map((node) => node.url?.replace(/\/$/, ''))
}

test.describe('书签新标签页', () => {
  test('以扩展首页打开并渲染书签栏内容', async ({ newtab: page }) => {
    await seed(page, { title: 'Alpha', url: 'https://alpha.test' })
    await seed(page, { title: 'Beta', url: 'https://beta.test' })
    await page.reload()

    await expect(page.locator('.bookmark-card')).toHaveCount(2)
    await expect(card(page, 'Alpha')).toBeVisible()
    await expect(card(page, 'Beta')).toBeVisible()
  })

  test('删除书签后从回收站恢复，书签回到原来的位置', async ({ newtab: page }) => {
    await seed(page, { title: 'Alpha', url: 'https://alpha.test' })
    await seed(page, { title: 'Beta', url: 'https://beta.test' })
    await page.reload()

    await menuAction(page, 'Alpha', 'Delete')
    await page.getByRole('dialog').getByRole('button').last().click()

    await expect(card(page, 'Alpha')).toHaveCount(0)
    await expect.poll(() => urlsOf(page, '1')).toEqual(['https://beta.test'])

    await page.getByRole('button', { name: /^Recycle bin/ }).click()
    const bin = page.getByRole('dialog')
    await bin
      .locator('li')
      .filter({ hasText: 'Alpha' })
      .getByRole('button', { name: 'Restore' })
      .click()
    await expect(card(page, 'Alpha')).toBeVisible()
    await expect.poll(() => urlsOf(page, '1')).toEqual(['https://alpha.test', 'https://beta.test'])
  })

  test('连续两批删除后，可在回收站里选择恢复其中一条', async ({ newtab: page }) => {
    await seed(page, { title: 'Alpha', url: 'https://alpha.test' })
    await seed(page, { title: 'Beta', url: 'https://beta.test' })
    await page.reload()

    for (const title of ['Alpha', 'Beta']) {
      await menuAction(page, title, 'Delete')
      await page.getByRole('dialog').getByRole('button').last().click()
      await expect(card(page, title)).toHaveCount(0)
    }
    await expect.poll(() => childrenOf(page, '1')).toEqual([])

    await page.getByRole('button', { name: /^Recycle bin/ }).click()
    const bin = page.getByRole('dialog')
    await expect(bin.locator('li')).toHaveCount(2)

    await bin
      .locator('li')
      .filter({ hasText: 'Beta' })
      .getByRole('button', { name: 'Restore' })
      .click()
    await expect(card(page, 'Beta')).toBeVisible()
    await expect(card(page, 'Alpha')).toHaveCount(0)
    await expect(bin.locator('li')).toHaveCount(1)

    await bin
      .locator('li')
      .filter({ hasText: 'Alpha' })
      .getByRole('button', { name: 'Restore' })
      .click()
    await expect(card(page, 'Alpha')).toBeVisible()
    await expect(bin.locator('li')).toHaveCount(0)
  })

  test('多选后批量移动到目标文件夹', async ({ newtab: page }) => {
    const targetId = await seed(page, { title: 'Target' })
    await seed(page, { title: 'Alpha', url: 'https://alpha.test' })
    await seed(page, { title: 'Beta', url: 'https://beta.test' })
    await page.reload()

    await page.getByRole('button', { name: 'Select items' }).click()
    await card(page, 'Alpha').click()
    await card(page, 'Beta').click()

    const toolbar = page.locator('#bookmark-selection-toolbar')
    await expect(toolbar).toBeVisible()
    await toolbar.getByRole('button', { name: 'Move to…' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.locator('label', { hasText: 'Target' }).click()
    await dialog.getByRole('button').last().click()

    await expect
      .poll(async () => (await childrenOf(page, targetId)).map((node) => node.title))
      .toEqual(['Alpha', 'Beta'])
    await expect
      .poll(async () => (await childrenOf(page, '1')).map((node) => node.title))
      .toEqual(['Target'])
  })

  test('按 / 唤起搜索并按标题过滤', async ({ newtab: page }) => {
    await seed(page, { title: 'Alpha', url: 'https://alpha.test' })
    await seed(page, { title: 'Beta', url: 'https://beta.test' })
    await page.reload()

    // `/` 监听在应用根节点上，焦点必须先落在页面内（真实用法也是先点一下页面）
    await card(page, 'Alpha').focus()
    await page.keyboard.press('/')
    const input = page.getByRole('textbox', { name: 'Search' })
    await expect(input).toBeFocused()
    await input.fill('alpha')

    await expect(card(page, 'Alpha')).toBeVisible()
    await expect(card(page, 'Beta')).toHaveCount(0)

    // Esc 两段：先清空内容，再收起搜索框
    await input.press('Escape')
    await expect(input).toHaveValue('')
    await input.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(card(page, 'Beta')).toBeVisible()
  })
})
