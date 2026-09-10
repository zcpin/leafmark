# Leafmark 商店素材包

适用版本：**1.0.0** · 准备日期：**2026-09-09**

本目录集中保存 Chrome Web Store 与 Microsoft Edge Add-ons 的提审素材。截图来自运行中的生产构建，使用公开示例网址和演示书签；推广图仅用于品牌展示。

2026-09-10：发布者确认 **Edge 1.0.0 已通过审核**，正式地址为 <https://microsoftedge.microsoft.com/addons/detail/ncpniokijejakopmbfcjonalbdbggdah>。本目录素材仍对应 1.0.0；仓库中的 1.1.0 为新增多选、批量移动与传统色主题的更新候选版，尚未提交本次更新。Chrome 商店发布状态未确认。

## 提审准备状态

以下为 1.0.0 的提审准备记录：自动化、类型、lint、覆盖率和构建验证通过。Edge 发布已完成；下文后台事项保留作 Chrome 提交和后续更新的参考。

- 最低版本为 Chrome/Edge 111，与构建目标及 Tailwind CSS 4 的兼容要求一致。
- 固定权限为 `bookmarks`、`favicon`、`storage`、`tabGroups`；可选权限为 HTTP/HTTPS 网站访问。
- 创建标签页和调用 `tabs.group` 不需要敏感的 `tabs` 权限，当前包已移除该权限。
- 独立空白 Edge 152 配置中已验证原生书签恢复、双页面并发撤销和移除 `tabs` 权限后的批量分组。
- 隐私政策需要公开、无需登录即可访问。**本地文件和尚未推送到 GitHub 的文件地址不能直接用作已生效的政策 URL。**

## 上传文件对应表

| 后台字段 | 文件 | 规格 |
| --- | --- | --- |
| 扩展 ZIP | `package/leafmark-v1.0.0.zip` | Chrome/Edge 共用；生成产物不纳入 Git |
| Chrome 扩展图标 | `icons/chrome-128.png` | 128×128，96×96 图案及每边 16px 透明留白；包内图标一致 |
| Edge 扩展 Logo | `icons/edge-300.png` | 300×300 PNG；两个语言可复用 |
| 小型推广图 | `promo/small-440x280.png` | 440×280 PNG；Chrome 必填，Edge 可选 |
| 大型推广图 | `promo/marquee-1400x560.png` | 1400×560 PNG；可选 |
| 英文截图 | `screenshots/en/01-*.png` 至 `05-*.png` | 5 张，1280×800 |
| 简体中文截图 | `screenshots/zh_CN/01-*.png` 至 `05-*.png` | 5 张，1280×800 |
| 名称、短描述、详细描述 | `listings/en/`、`listings/zh_CN/` | 每个字段单独一个 UTF-8 文本文件 |
| 隐私政策 | `privacy/PRIVACY.md`、`privacy/privacy-policy.html` | 中英双语，HTML 可独立托管 |
| 权限说明与审核备注 | [submission-notes.md](./submission-notes.md) | 后台填写依据和复现步骤 |
| 素材清单 | `asset-manifest.json`、`SHA256SUMS.txt` | 尺寸、用途及文件校验值 |

Chrome 的推广图目前不按语言区分，因此本包使用通用的 Leafmark 品牌图。截图按语言提供；Edge 可为每种语言复用同一推广图。截图为完整页面，没有额外边框或文字包装。

## 推荐截图顺序

1. `01-home-light.png`：浅色主页、卡片网格与时钟。
2. `02-home-dark.png`：深色主题与本地预设壁纸。
3. `03-folder-preview.png`：文件夹悬停及级联预览。
4. `04-duplicates.png`：重复书签及保留副本选择。
5. `05-settings.png`：外观、透明度、壁纸和显示设置。

## 提交前由发布者完成

- [ ] 登录并完成 Chrome/Edge 开发者账号及发布者资料。
- [ ] 公开发布隐私政策，再将实际可访问的 HTTPS 地址填写到后台。
- [ ] 核对后台数据使用披露与 [隐私政策](./privacy/PRIVACY.md) 一致；本地处理书签同样需要政策说明。
- [ ] 使用测试配置文件加载 ZIP，确认新标签页替换提示和首次可选网站权限授权流程。
- [ ] 填写名称、描述、截图、图标、推广图和审核备注后，提交审核。

公开支持地址为 <https://github.com/zcpin/leafmark/issues>。政策文件推送到公开仓库后，可使用其 GitHub 页面地址；也可单独托管 `privacy-policy.html`。Edge 1.0.0 的审核状态见本文开头，素材重新生成本身不代表后续版本已提交。

## 重新生成

```powershell
pnpm icons
pnpm build
pnpm zip
node scripts/store-assets/prepare.mjs
```

`prepare.mjs` 生成 Logo、隐私政策 HTML，并复制已有安装包。截图与推广图按 [素材制作说明](./source/README.md) 从浏览器导出；完成后运行 `node scripts/store-assets/validate.mjs` 校验并刷新素材清单。

## 官方规格来源

核对日期：2026-09-09。

- [Chrome：图片、图标、推广图和截图](https://developer.chrome.com/docs/webstore/images)
- [Chrome：本地处理用户信息也需要隐私政策（第 14 问）](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome：Tabs API 权限要求](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Edge：发布流程及素材规格](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Tailwind CSS：浏览器兼容性](https://tailwindcss.com/docs/compatibility)
