# 浏览器书签新标签页插件 — 调研文档

> 参考项目：[Alanrk/TabMark-Bookmark-New-Tab](https://github.com/Alanrk/TabMark-Bookmark-New-Tab)（TabMark，版本 1.245）
> 调研日期：2026-08-26
> 目标：开发一个「在新标签页中展示浏览器收藏夹」的浏览器插件，并能上架扩展市场。
> 项目名称（已定 2026-08-27）：**Leafmark**（中文名：**叶签**）

---

## 〇、命名决定（已确认）

- **英文名**：`Leafmark` — Leaf（叶 / 书页，leaf 的古义）+ mark（书签）。一片落在书页间的叶子即是书签，与新标签页「书架」的隐喻契合；可做树叶 logo，视觉记忆点强。
- **中文名**：**叶签** — 「叶」呼应 Leaf，「签」即书签。
- **商店全称建议**：`Leafmark — Bookmark New Tab`（品牌词 + 功能关键词，利于商店搜索与「单一用途=书签」定位）。
- **目录/仓库名**：`Leafmark`（本地目录，PascalCase）；GitHub 仓库建议 `leafmark`（小写）。
- **查重结论**（2026-08-27）：Chrome 商店 / Firefox 商店 / GitHub 无同名扩展；`leafmark.com`、`leafmark.net` 域名已被无关网站占用，若日后需要官网建议 `leafmark.app` / `getleafmark.com`。
- 已排除的撞名候选：TabMark（参考项目本名）、TabShelf、Startab、Shelfmark、MarkPage、Pagemark、Dogear、Folio——均有同名或近功能扩展。

---

## 一、参考项目概述

TabMark 是一个把浏览器书签变成新标签页的扩展，支持 Chrome 与 Edge。核心定位是「让收藏夹被重新看见」，并在此基础上叠加了 AI 搜索、对比搜索、侧边栏、悬浮球、壁纸等大量附加功能。

值得注意的是，参考项目 README 明确写道：

> **由于 Chrome 商店新的条款要求，扩展不允许同时修改新标签页和搜索功能，故 Chrome 商店版本暂时无法更新。**
> Chrome 商店版本：1.243（实际为 1.241 版本，为 1.242 版本回滚）；Edge 版本：1.245 审核中；GitHub 版本：1.245。

这是本次调研得到的**最关键上架约束**，直接影响我们的功能取舍（详见第三节）。

---

## 二、参考项目功能点清单（供筛选）

> 用「✅保留 / ⚠️可选 / ❌建议砍掉」三种状态标注，便于后续逐条筛选。当前为初步建议，最终以你的决定为准。

### A. 核心功能（书签展示）

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| A1 | 书签设为新标签页 | 安装后覆盖 `chrome_url_overrides.newtab`，新标签页展示书签 | `manifest.json` + `src/index.html` | ✅保留（项目核心） |
| A2 | 选择书签文件夹作为主页 | 右键点击书签文件夹 →「将书签设为主页」，记录 `defaultBookmarkId` 到 `chrome.storage.local` | `background.js`（`setDefaultBookmarkId`） | ✅保留 |
| A3 | 书签卡片网格展示 | 以卡片网格形式展示所选文件夹内的书签，含 favicon + 标题 | `src/script.js` | ✅保留 |
| A4 | 书签拖拽排序 | 用 Sortable.js 实现书签卡片拖拽排序，写回 `chrome.bookmarks` | `src/Sortable.min.js` + `script.js` | ✅保留 |
| A5 | 侧边栏树状文件夹视图 | 左侧树形结构展示书签文件夹层级，便于快速定位 | `script.js` | ✅保留 |
| A6 | 文件夹面包屑/层级导航 | 进入子文件夹、返回上级文件夹 | `script.js` + `gesture-navigation.js` | ✅保留 |
| A7 | 手势返回上级文件夹 | Mac 触控板双指右滑 / Windows 触控板 / 鼠标横向滚轮 → 返回上级文件夹 | `gesture-navigation.js` | ⚠️可选（锦上添花，实现复杂） |
| A8 | 多默认文件夹 + 上次查看记忆 | 支持设置多个默认文件夹，记住上次查看的文件夹 | `content.js`（`defaultFolders` / `lastViewedFolder`） | ⚠️可选 |

### B. 书签上下文菜单

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| B1 | 复制书签 URL | 右键书签 → 复制链接 | `script.js`（`copyToClipboard`） | ✅保留 |
| B2 | 生成二维码 | 右键书签 → 生成 URL 二维码（可复制/下载） | `script.js` + `qrcode.min.js` | ⚠️可选（移动端跨设备场景） |
| B3 | 一键打开文件夹内所有书签 | 右键文件夹 → 批量打开，并用 `chrome.tabs.group` 分组 | `background.js`（`openMultipleTabsAndGroup`） | ✅保留（高频实用） |
| B4 | 编辑/删除书签 | 右键书签 → 编辑标题/URL、删除（含确认对话框） | `script.js` | ✅保留 |

### C. 搜索相关（⚠️ 重点政策风险区）

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| C1 | 新标签页搜索框 | 新标签页顶部搜索框，调用选定搜索引擎 | `script.js` + `search-engine-dropdown.js` | ❌建议砍掉（见第三节，与 A1 同处一扩展会触发「单一用途」违规） |
| C2 | 多搜索引擎切换 | 20+ 内置引擎（Google/Bing/百度/Kimi/豆包/ChatGPT…）下拉切换 | `search-engine-dropdown.js`（`ALL_ENGINES`） | ❌建议砍掉 |
| C3 | 自定义搜索引擎 | 用户可添加自定义搜索引擎（URL 含 `%s` 占位符） | `search-engine-dropdown.js`（`saveCustomEngine`） | ❌建议砍掉 |
| C4 | AI 智能搜索 | 一键调用豆包/Kimi/秘塔/Felo/ChatGPT 等进行搜索 | `search-engine-dropdown.js` + `content.js` | ❌建议砍掉 |
| C5 | 对比搜索 | `Cmd/Ctrl+Enter` 在所有启用引擎中同时搜索同一关键词 | `script.js`（`openAllSearches`） | ❌建议砍掉 |
| C6 | 选中文字 + 快捷键搜索 | 任意网页选中文字 → `Alt+1~9` 打开对应引擎 / `Cmd/Ctrl+Enter` 打开全部 | `content.js`（注入所有页面） | ❌建议砍掉 |
| C7 | 书签/历史记录搜索 | 在新标签页搜索框中搜索书签和历史记录 | `script.js` | ⚠️可选（仅「书签搜索」可保留，且不引入搜索引擎） |
| C8 | 自动填充搜索词到 AI 站点 | 打开 Kimi/ChatGPT/豆包等时自动把 `?q=` 参数填入输入框并提交 | `content.js`（`AutoInputManager` + `siteConfigs`） | ❌建议砍掉（侵入式操作目标站点，审核高风险） |

### D. 侧边栏 & 悬浮球（注入到所有网页）

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| D1 | 浏览器侧边栏书签 | `Alt/Cmd+B` 打开 Chrome 侧边栏，访问书签 | `background.js` + `sidepanel.html` + `sidepanel-manager.js` | ⚠️可选（功能重，且偏离「纯新标签页」单一用途） |
| D2 | 悬浮球 | 任意网页右上角悬浮球，显示搜索快捷链接和默认书签 | `content.js`（注入 `all_urls`） | ❌建议砍掉（注入所有页面 + 非书签展示用途，审核高风险） |
| D3 | 侧边栏内导航历史 | 侧边栏内前进/后退、历史记录栈 | `background.js`（`sidePanelHistory`）+ `sidepanel-navigation.js` | ❌建议砍掉 |

### E. 快捷链接 & 历史

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| E1 | 快捷链接（常用网站） | 基于历史记录智能排序（频率+时效加权）生成常用网站卡片，可固定/编辑/删除/黑名单 | `quick-links.js`（`sortHistoryItems`） | ⚠️可选（需 `history` 权限；与「书签展示」定位略偏） |
| E2 | 浏览器功能快捷入口 | 历史 / 下载 / 密码 / 扩展管理 的快捷链接 | `settings.js`（`showHistoryLink` 等） | ⚠️可选（轻量，可保留） |

### F. 个性化 & 外观

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| F1 | 暗黑模式 | 支持浅色/深色/跟随系统 | `settings.js`（`initTheme`） | ✅保留 |
| F2 | 预设壁纸 | 10 张精选预设壁纸 | `wallpaper.js`（`presetWallpapers`） | ✅保留 |
| F3 | 本地上传壁纸 | 上传本地图片作为壁纸（含压缩/缩略图/配额管理） | `wallpaper.js`（`handleFileUpload`） | ✅保留 |
| F4 | 必应每日壁纸 | 拉取 Bing 每日壁纸 | `wallpaper.js`（`fetchBingWallpapers`） | ⚠️可选（需访问 `cn.bing.com`，需 host_permissions，审核需说明用途） |
| F5 | 纯色/渐变背景 | 内置纯色/渐变背景选项 | `wallpaper.js` + `settings.js` | ✅保留 |
| F6 | 卡片尺寸/布局调节 | 书签卡片宽度、高度、容器宽度滑块调节 | `settings.js`（`initBookmarkWidthSettings` 等） | ✅保留 |
| F7 | 欢迎语 | 顶部欢迎语，自适应壁纸文字颜色 | `welcome.js` | ⚠️可选 |

### G. 其他

| # | 功能 | 说明 | 参考实现 | 初步建议 |
|---|------|------|----------|----------|
| G1 | 引导教程（Onboarding） | 首次访问 3 步引导，`localStorage` 记录完成状态 | `onboarding.js` | ✅保留（提升首次体验） |
| G2 | 多语言国际化 | 9 种语言（de/en/es/fr/ja/ko/zh_CN/zh_HK/zh_TW），`chrome.i18n` + `_locales/` | `_locales/*/messages.json` + `localization.js` | ✅保留（至少中英文） |
| G3 | 书签清理工具联动 | 设置中打开第三方「懒猫书签清理」扩展 | `bookmark-cleanup.js` | ❌建议砍掉（与第三方扩展耦合） |
| G4 | 滚轮切换 | 鼠标滚轮切换书签文件夹 | `settings.js`（`enableWheelSwitching`） | ⚠️可选 |
| G5 | 链接打开方式设置 | 新标签页/当前页打开、侧边栏内/新标签打开 | `settings.js` | ✅保留 |

---

## 三、上架市场政策与约束（重点）

### 1. 「单一用途」原则（Single Purpose）

Chrome / Edge 扩展商店要求每个扩展有**一个清晰、狭义的用途**。参考项目踩到的坑已写在其 README：

> 扩展不允许同时修改新标签页和搜索功能。

也就是说，**同时声明 `chrome_url_overrides.newtab`（覆盖新标签页）和提供搜索/omnibox 功能，会被判定为「用途不止一个」**，从而无法通过 Chrome 商店审核（参考项目 Chrome 商店版因此停留在 1.241 无法更新）。

**对本项目的直接结论：**
- ✅ 扩展的核心用途 =「在新标签页展示/管理书签」。
- ❌ 不要在同一扩展中内置搜索引擎切换、对比搜索、AI 搜索、选中文字搜索等功能。
- ⚠️ 纯粹「在自己的书签列表里搜索书签」属于书签管理的自然延伸，风险较低；但**绝不要**接入任何外部搜索引擎 URL 拼接搜索。

### 2. 权限最小化（Permissions）

参考项目申请了大量权限，其中不少对「书签新标签页」是过度的。我们的原则是**只用必需权限**，并在商店描述中逐项说明用途（商店要求对敏感权限给出使用说明）。

| 权限 | 参考项目用途 | 本项目是否需要 | 说明 |
|------|--------------|----------------|------|
| `bookmarks` | 读取/排序/增删书签 | ✅ 需要 | 核心，必申请 |
| `favicon` | 读取站点 favicon | ✅ 需要 | 展示书签图标，必申请 |
| `storage` | 存设置 | ✅ 需要 | 必申请 |
| `history` | 快捷链接排序、历史搜索 | ⚠️ 仅当保留 E1/E2/C7 时 | 权限敏感，能省则省 |
| `tabGroups` | 批量打开书签并分组 | ⚠️ 仅当保留 B3 时 | 可选 |
| `tabs` | 创建/查询标签页 | ✅ 需要（打开书签、B3） | 可与 `tabGroups` 合并说明 |
| `management` | 检测第三方扩展是否安装 | ❌ 不需要 | 砍掉 G3 即不需要 |
| `sidePanel` | 侧边栏书签 | ❌ 不需要 | 砍掉 D1 即不需要 |
| `commands` | `Alt+B` 快捷键 | ❌ 不需要 | 砍掉侧边栏即不需要 |
| `host_permissions`（`<all_urls>`） | 悬浮球、内容脚本注入所有站点 | ❌ 不需要 | 砍掉 C6/D2/C8 即不需要——**大幅降低审核风险** |

> **关键收益**：砍掉 C6/D2/C8/C4 后，我们可以**不申请任何 `host_permissions`，也不注入任何 content script 到所有页面**。这是商店审核通过率的巨大加分项——无 `<all_urls>` 的扩展审核远比注入全网的扩展宽松。

### 3. 其他上架注意点
- **MV3 必须**：商店已强制 Manifest V3。参考项目已是 MV3，我们沿用。
- **服务工作者（Service Worker）**：后台用 `background.service_worker`，不能依赖持久内存。
- **隐私政策**：若申请 `history` 等敏感权限，需提供隐私政策链接并说明数据不外传。本项目若砍掉 `history`，可声明「不收集任何用户数据」。
- **图标/截图/描述**：需准备 16/48/128px 图标、商店截图、简明描述。
- **单文件大小/资源**：参考项目把壁纸打包进扩展，导致体积大；我们可考虑只内置少量壁纸或改为按需加载（注意商店对远程资源加载有限制，`externally_connectable`/远程脚本需谨慎）。

---

## 四、技术选型建议

### 4.1 整体技术栈

参考项目是**原生 JS + ES Modules + 少量第三方库**，无前端框架、无构建步骤（`package.json` 里虽有 Tailwind 但仅用于生成 `output.css`，源码直接引用产物）。

| 方面 | 参考项目方案 | 本项目建议 | 理由 |
|------|--------------|------------|------|
| 框架 | 原生 JS + ES Modules | **Vue 3 + Vite** 或 **原生 JS + Vite** | 见下方「框架之争」 |
| 构建 | 无构建（直接引 `output.css`） | **Vite 构建** | 模块化、压缩、Tree-shaking、HMR 开发体验 |
| 样式 | Tailwind 产物 `output.css` + 手写 `styles.css` | **Tailwind CSS** 或 **UnoCSS** | 与 Vite 生态契合，原子化、易维护暗色模式 |
| 语言 | 纯 JS | **TypeScript** | 类型安全，商店审核期间重构成本低；符合团队编码规范 |
| 状态管理 | 全局变量 + `chrome.storage` 直接读写 | **Pinia**（若用 Vue）或模块化 store | 参考项目状态散落各处、易出 bug，集中管理更稳 |
| 拖拽 | `Sortable.min.js`（打包进仓库） | **SortableJS**（npm 安装）或原生 HTML5 Drag | 避免 vendor 文件进仓库 |
| 节流/防抖 | `lodash.min.js`（打包进仓库） | 按需 import `lodash-es` 或手写 | 减体积 |
| 二维码 | `qrcode.min.js` | `qrcode` npm 包（若保留 B2） | 同上 |
| 国际化 | `chrome.i18n` + `_locales/` | **沿用 `chrome.i18n`** | 扩展原生方案，零成本、商店友好 |
| 存储 | `localStorage` + `chrome.storage.sync/local` | **统一用 `chrome.storage`** | `localStorage` 不跨设备同步且无变更通知；参考项目混用导致状态不一致 |
| 测试 | 无 | **Vitest + 单元测试** | 团队规范要求 80% 覆盖率 |

#### 框架之争：Vue 3 vs 原生 JS

- **推荐 Vue 3 + Vite + TS**：
  - 书签树、设置面板、右键菜单、拖拽都是典型 UI 组件场景，Vue 的响应式 + 组件化能显著降低复杂度（参考项目 `script.js` 单文件超大、状态全局散落，正是反例）。
  - 符合全局编码规范「多个小文件 > 少量大文件」「高内聚低耦合」。
  - 生态成熟：`@vueuse/core`、Pinia、Vue Router（如需）。
  - 注意：Vite 构建扩展需配合 `@crxjs/vite-plugin` 或手动配置 `manifest` 产物。
- **备选原生 JS + Vite**：若希望极致轻量、零运行时依赖、最贴近参考项目实现，可选原生 JS + Vite + TS。体积最小，但 UI 维护成本更高。

> 我的倾向：**Vue 3 + Vite + TS + Tailwind + Pinia**。开发效率与可维护性最佳，且完全满足商店上架要求。

### 4.2 目录结构建议

```
Leafmark/
├── manifest.json
├── src/
│   ├── newtab/              # 新标签页入口
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   └── components/      # BookmarkCard / FolderTree / ContextMenu ...
│   ├── background/          # service worker
│   │   └── index.ts
│   ├── options/             # 设置页（可选，独立页面）
│   ├── stores/              # Pinia stores
│   ├── composables/         # useBookmarks / useSettings
│   ├── lib/                 # 浏览器 API 封装、类型定义
│   └── assets/              # 图标、少量壁纸
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── tests/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 4.3 关键浏览器 API 封装建议
- `chrome.bookmarks`：用 Promise 包装（MV3 已支持回调与 Promise 混用，建议统一 Promise）。
- `chrome.storage`：封装 `get/set`，集中类型定义；提供变更监听自动刷新 UI。
- favicon：用 `chrome://favicon/` 或 `chrome.runtime.getURL('/_favicon/')` + `pageUrl` 参数（参考项目做法）。
- 拖拽排序：`chrome.bookmarks.move` 写回真实书签树（而非仅本地状态）。

---

## 五、功能筛选建议（汇总）

基于「上架市场 + 单一用途 + 权限最小化 + 项目定位」四个维度，给出如下建议：

### 第一批（MVP，必做）
- **A1** 书签设为新标签页
- **A2** 选择书签文件夹作为主页
- **A3** 书签卡片网格展示（favicon + 标题）
- **A4** 书签拖拽排序
- **A5** 侧边栏树状文件夹视图
- **A6** 文件夹层级导航（面包屑 + 返回）
- **B1** 复制书签 URL
- **B3** 一键打开文件夹内所有书签（+ 标签分组）
- **B4** 编辑/删除书签
- **F1** 暗黑模式（含跟随系统）
- **F5** 纯色/渐变背景
- **G1** 引导教程
- **G2** 多语言（中/英起步）
- **G5** 链接打开方式设置

### 第二批（增强，建议做）
- **F2** 预设壁纸
- **F3** 本地上传壁纸
- **F6** 卡片尺寸/布局调节
- **C7（仅书签部分）** 书签内搜索（不接入搜索引擎）
- **E2** 浏览器功能快捷入口（历史/下载/密码/扩展）

### 第三批（可选，按需）
- **A8** 多默认文件夹 + 记忆
- **B2** 二维码
- **E1** 快捷链接（需 `history` 权限，权衡隐私政策成本）
- **F4** 必应每日壁纸（需 host_permissions，权衡审核成本）
- **A7** 手势返回、**G4** 滚轮切换、**F7** 欢迎语

### 建议砍掉（降低审核风险、聚焦定位）
- **C1~C6, C8** 所有外部搜索引擎/AI 搜索/对比搜索/选中文字搜索/自动填充（单一用途违规 + `<all_urls>` 注入风险）
- **D1~D3** 侧边栏书签、悬浮球、侧边栏导航（偏离新标签页定位 + 注入全网）
- **G3** 第三方书签清理工具联动（耦合第三方扩展、需 `management` 权限）

---

## 六、风险点与待确认事项

1. **「新标签页 + 书签内搜索」是否安全？** 纯本地书签过滤搜索通常不触发单一用途违规；但需措辞谨慎，搜索框仅过滤书签，绝不拼接外部搜索 URL。建议上架前以「仅书签搜索」描述送审。
2. **壁纸资源体积**：商店对扩展包体积有隐性偏好。建议只内置 3~5 张预设壁纸，其余走「本地上传」。
3. **必应壁纸是否值得**：需 `host_permissions: https://cn.bing.com/*`，且远程拉取图片需在隐私政策中说明。MVP 可不做。
4. **是否支持 Edge**：Edge 商店政策相对宽松（参考项目 Edge 版可更新到 1.245）。本项目若砍掉搜索功能，Chrome/Edge 可共用同一套代码上架，零额外成本。
5. **是否需要 Options 页**：设置项较多时建议独立 `options_page`，而非全部塞进新标签页的侧滑设置栏。

---

## 七、下一步

1. ~~确认项目名称~~ ✅ 已定：**Leafmark / 叶签**，目录已重命名为 `Leafmark`。
2. ~~功能清单逐条确认~~ ✅ 已确认，见 [02-决定-功能范围与技术选型.md](./02-决定-功能范围与技术选型.md)。
3. ~~确认技术栈~~ ✅ Vue 3 + Vite + TS + Tailwind + Pinia（最新稳定版）。
4. ~~确认目标市场~~ ✅ Chrome + Edge。
5. ~~实现计划~~ ✅ 已产出，见 [03-实现计划.md](./03-实现计划.md)。**当前待办：按 Phase 0 开工。**
