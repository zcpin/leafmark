# Edge 商店发布（Add-ons 发布 API）

> 2026-10-10：Leafmark 已在 Microsoft Edge 商店上架（1.0.0），此前每次更新都要在 Partner Center 手动上传 ZIP。本轮把这一步脚本化，详见 `scripts/publish-edge.mjs` 与 `pnpm publish:edge`。

## 能做什么、不能做什么

Microsoft 的 **Microsoft Edge Add-ons Update REST API** 只能更新**已存在的产品**，且只暴露四个端点：

| 操作            | 端点                                                                              |
| --------------- | --------------------------------------------------------------------------------- |
| 上传包到 draft  | `POST /v1/products/{productId}/submissions/draft/package`                         |
| 查询上传状态    | `GET /v1/products/{productId}/submissions/draft/package/operations/{operationId}` |
| 提交 draft 认证 | `POST /v1/products/{productId}/submissions`                                       |
| 查询提交状态    | `GET /v1/products/{productId}/submissions/operations/{operationId}`               |

端点根为 `https://api.addons.microsoftedge.microsoft.com`。

**不做**：创建新产品、改描述/截图/推广图/分类等 listing 元数据、分市场上架。这些只能在 Partner Center 里做，所以**首次上架必须手动**。

## 准备凭据

1. **产品 ID（GUID）**：Partner Center → Microsoft Edge → 概览 → 选择叶签 → 扩展概览页的 Product ID；地址栏 `microsoftedge/` 与 `/packages` 之间的 GUID 也是它。
2. **Client ID 与 API Key**：同一后台的 **Publish API** 页面点「Create API credentials」生成。API Key **有到期日**，记在日历里到期前轮换。
3. （可选）v1 令牌模式：Azure AD 应用的租户 ID + 客户端密钥，脚本会换取 Bearer 令牌；填 `EDGE_TENANT_ID` 与 `EDGE_CLIENT_SECRET` 即可。**有 API Key 时优先用 v1.1，更简单。**

写入仓库根目录 `.env`（已在 `.gitignore` 内，`.env.example` 是模板），或直接用环境变量；CI 用仓库 secrets。

```dotenv
EDGE_PRODUCT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EDGE_CLIENT_ID=...
EDGE_API_KEY=...
```

## 命令

```powershell
pnpm build                 # 脚本会校验 dist/manifest.json 与 package.json 版本一致
pnpm publish:edge:dry      # 只做本地校验并打印计划（版本、文件、SHA-256、备注），不联网
pnpm publish:edge:draft    # 上传包到 draft 就停，可在后台核对后再手动提交
pnpm publish:edge          # 上传 + 提交认证，两个异步操作都轮询到终态才退出
```

常用参数：

| 参数                                     | 说明                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--zip <path>`                           | 指定上传的 zip，原样使用；不指定时先调用 `scripts/zip-dist.mjs` 重新打包，避免上传上一次构建遗留的旧文件                                                    |
| `--notes <text>` / `--notes-file <path>` | 提审备注，超 2000 字会被拦下；默认 `Leafmark {版本}`。认证团队看英文，建议写简短英文摘要；`store-assets/submission-notes.md` 是完整权限说明，整篇当备注太长 |
| `--timeout <seconds>`                    | 单个异步操作等待上限，默认 900 秒                                                                                                                           |
| `--no-publish`                           | 只上传 draft（即 `publish:edge:draft`）                                                                                                                     |
| `--dry-run`                              | 只校验不联网                                                                                                                                                |

## 脚本行为

1. 校验 `dist/manifest.json` 与 `package.json` 版本一致（与 CI 的发布校验同一条规则）。
2. `POST .../draft/package`，请求体是 zip 二进制，`Content-Type: application/zip`。返回 `202 Accepted`，`Location` 头里是 operation ID。
3. 轮询上传状态，退避间隔 5s → 最多 30s，直到 `Succeeded` / `Failed`；`Failed` 会把 API 返回的 `errors` 打出来。
4. `POST .../submissions`，JSON 体 `{ "notes": "..." }`，同样返回 operation ID 并轮询。
5. 两步都出现 `Succeeded` 才打印成功；任何一步 `Failed` 非零退出，CI 会因此失败。

429 与 5xx 会自动退避重试；超时会打印 operation ID，便于稍后复查。

## CI

`.github/workflows/publish-edge.yml` 是 **手动触发**（`workflow_dispatch`），不会随 tag 或 push 自动发布：

- Actions → **Publish to Edge Add-ons** → Run workflow
- 可选勾选 `draft_only`（只传包不提审）、填写 `notes`
- 需要仓库 secrets：`EDGE_PRODUCT_ID`、`EDGE_CLIENT_ID`、`EDGE_API_KEY`

## 注意事项

- **版本号必须递增**：Edge 不接受低于或等于线上版本的包，发版前先改 `package.json` 与 `public/manifest.json`。
- 上传到 draft 会**覆盖**上一次未提交的 draft；`--no-publish` 之后再 `pnpm publish:edge` 会重新传包并提交。
- 提交后进入 Microsoft 的认证流程，通常数个工作日，脚本不等待认证结果——状态在 Partner Center 扩展概览页看。
- 商店 listing（描述、截图、推广图、隐私政策链接）仍由 Partner Center 维护，`store-assets/` 里的素材要手动上传。
- ZIP 与 Chrome 版通用：Edge 是 Chromium 内核，`pnpm zip` 的产物可直接用。
