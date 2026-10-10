// 通过 Edge Add-ons 发布 API 把本地打包产物提交到 Microsoft Edge 商店。
//
// 用法：
//   pnpm publish:edge              上传包并提审（两步异步操作都会轮询到终态）
//   pnpm publish:edge:draft        只把包上传到 draft，不提交审核
//   pnpm publish:edge:dry          只做本地校验并打印计划，不联网
//
// 凭据（写进仓库根目录 .env，或直接注入环境变量；CI 用仓库 secrets）：
//   EDGE_PRODUCT_ID     Partner Center 里该扩展的产品 ID（GUID）
//   EDGE_CLIENT_ID      Publish API 页面生成的 Client ID
//   EDGE_API_KEY        与 Client ID 配套的 API Key（v1.1，推荐）
//   EDGE_TENANT_ID      Azure AD 租户 ID（v1 令牌模式，可选）
//   EDGE_CLIENT_SECRET  Azure AD 应用密钥（v1 令牌模式，可选）
//
// 常用参数：
//   --zip <path>        指定要上传的 zip（默认 leafmark-v{版本}.zip）
//   --notes <text>      提审备注；也可用 --notes-file <path> 从文件读取
//   --timeout <seconds> 单个异步操作的等待上限（默认 900）
//   --no-publish        上传后不提审
//   --dry-run           只校验不联网
//
// 注意：API 只能更新已存在的产品，首次上架仍需在 Partner Center 手动完成；
// 每次上传的版本号必须高于商店中已有的版本。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com/v1/products'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TERMINAL = new Set(['Succeeded', 'Failed'])
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

function parseArgs(argv) {
  const args = {
    zip: '',
    notes: '',
    notesFile: '',
    timeout: DEFAULT_TIMEOUT_MS,
    publish: true,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = () => argv[++i] ?? ''
    switch (flag) {
      case '--zip':
        args.zip = next()
        break
      case '--notes':
        args.notes = next()
        break
      case '--notes-file':
        args.notesFile = next()
        break
      case '--timeout':
        args.timeout = Number(next()) * 1000
        break
      case '--no-publish':
        args.publish = false
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '-h':
      case '--help':
        args.help = true
        break
      default:
        fail(`未知参数：${flag}（用 --help 查看用法）`)
    }
  }
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) fail('--timeout 需要正数秒数')
  return args
}

// 读取 .env（无依赖的最小实现）：不覆盖进程里已有的环境变量
function loadEnvFile() {
  const file = join(root, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim()
    if (!text || text.startsWith('#')) continue
    const eq = text.indexOf('=')
    if (eq < 1) continue
    const key = text.slice(0, eq).trim()
    let value = text.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function mask(value) {
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-2)}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readConfig() {
  const productId = process.env.EDGE_PRODUCT_ID?.trim() ?? ''
  const clientId = process.env.EDGE_CLIENT_ID?.trim() ?? ''
  const apiKey = process.env.EDGE_API_KEY?.trim() ?? ''
  const tenantId = process.env.EDGE_TENANT_ID?.trim() ?? ''
  const clientSecret = process.env.EDGE_CLIENT_SECRET?.trim() ?? ''

  if (!productId)
    fail('缺少 EDGE_PRODUCT_ID（Partner Center → Microsoft Edge → 扩展概览页复制产品 ID）')
  if (!GUID.test(productId)) fail(`EDGE_PRODUCT_ID 不是 GUID：${productId}`)
  if (!clientId) fail('缺少 EDGE_CLIENT_ID（Publish API 页面生成的 Client ID）')

  // v1.1 用 API Key 直连；v1 用 Azure AD 应用换 Bearer 令牌
  if (apiKey) {
    // X-ClientID 必须是 GUID，否则 API 直接返回 400
    if (!GUID.test(clientId)) fail(`EDGE_CLIENT_ID 不是 GUID：${clientId}`)
    return { productId, clientId, mode: 'v1.1', apiKey }
  }
  if (tenantId && clientSecret) return { productId, clientId, mode: 'v1', tenantId, clientSecret }
  fail('缺少凭据：提供 EDGE_API_KEY（v1.1），或同时提供 EDGE_TENANT_ID 与 EDGE_CLIENT_SECRET（v1）')
}

async function v1Token({ clientId, tenantId, clientSecret }) {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://api.addons.microsoftedge.microsoft.com/.default',
    }).toString(),
  })
  if (!res.ok) {
    const body = await res.text()
    fail(`获取访问令牌失败：${res.status} ${body}`)
  }
  const { access_token: token } = await res.json()
  if (!token) fail('令牌响应里没有 access_token')
  return token
}

async function authHeaders(config) {
  if (config.mode === 'v1.1') {
    return { Authorization: `ApiKey ${config.apiKey}`, 'X-ClientID': config.clientId }
  }
  return { Authorization: `Bearer ${await v1Token(config)}` }
}

async function describeError(res, action) {
  const raw = await res.text()
  let detail = raw
  try {
    const body = JSON.parse(raw)
    detail = body.message ?? body.error?.message ?? JSON.stringify(body)
  } catch {
    /* 保持原始文本 */
  }
  fail(`${action}失败：${res.status} ${detail}`)
}

// 429 / 5xx 按退避重试，其余状态码直接抛
async function request(url, options, action) {
  let lastError = ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, options)
    if (res.ok || res.status === 202) return res
    if (res.status === 429 || res.status >= 500) {
      lastError = `${res.status} ${await res.text()}`
      await sleep(2000 * (attempt + 1))
      continue
    }
    await describeError(res, action)
  }
  fail(`${action}失败：连续被限流或服务端错误 —— ${lastError}`)
}

function operationId(res, action) {
  const location = res.headers.get('location') ?? ''
  const id = decodeURIComponent(location.split('/').filter(Boolean).pop() ?? '')
  if (!id) fail(`${action}未返回 Location 头，无法跟踪异步操作`)
  return id
}

async function pollOperation(url, headers, { label, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  let delay = 5000
  let last = 'InProgress'
  while (true) {
    const res = await request(url, { headers }, `查询${label}状态`)
    const body = await res.json()
    last = body.status ?? last
    if (TERMINAL.has(last)) {
      process.stdout.write(` ${last === 'Succeeded' ? '✓' : '✗'} ${last}\n`)
      return body
    }
    if (Date.now() > deadline) {
      fail(
        `等待${label}超时（仍为 ${last}）。稍后用下方 operation ID 复查，或在 Partner Center 查看。`,
      )
    }
    process.stdout.write(` … ${last}`)
    await sleep(delay)
    delay = Math.min(Math.round(delay * 1.5), 30000)
  }
}

function resolveZip(args) {
  const distManifest = join(root, 'dist', 'manifest.json')
  if (!existsSync(distManifest)) fail('dist/ 中没有 manifest.json，请先运行 pnpm build')
  const manifest = JSON.parse(readFileSync(distManifest, 'utf8'))
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest.version !== pkg.version) {
    fail(`版本不一致：dist/manifest.json 为 ${manifest.version}，package.json 为 ${pkg.version}`)
  }

  // 默认重新打包，避免上传上一次构建遗留的旧 zip；显式 --zip 则原样使用
  const zip = args.zip ? join(root, args.zip) : join(root, `leafmark-v${manifest.version}.zip`)
  if (args.zip) {
    if (!existsSync(zip)) fail(`找不到指定的 zip：${args.zip}`)
  } else {
    const built = spawnSync(process.execPath, [join(root, 'scripts', 'zip-dist.mjs')], {
      stdio: 'inherit',
    })
    if (built.status !== 0 || !existsSync(zip)) fail('打包失败')
  }
  const { size } = statSync(zip)
  if (size === 0) fail(`${zip} 是空文件`)
  return { zip, version: manifest.version, size }
}

function resolveNotes(args, version) {
  if (args.notesFile) {
    const file = join(root, args.notesFile)
    if (!existsSync(file)) fail(`找不到备注文件：${args.notesFile}`)
    return readFileSync(file, 'utf8').trim()
  }
  const notes = args.notes || process.env.EDGE_NOTES?.trim() || `Leafmark ${version}`
  if (notes.length > 2000)
    fail(`提审备注 ${notes.length} 字，超过 API 可接受的 2000 字上限，请先精简`)
  return notes
}

function printPlan(config, target, notes, args) {
  const sha256 = createHash('sha256').update(readFileSync(target.zip)).digest('hex')
  console.log('Edge Add-ons 发布计划')
  console.log(`  产品 ID    ${config.productId}`)
  console.log(
    `  认证方式   ${config.mode === 'v1.1' ? `v1.1 ApiKey（Client ID ${mask(config.clientId)}）` : 'v1 Bearer 令牌'}`,
  )
  console.log(`  上传文件   ${target.zip}`)
  console.log(`  版本/大小  ${target.version} / ${(target.size / 1024).toFixed(1)} KiB`)
  console.log(`  SHA-256    ${sha256}`)
  console.log(`  提审备注   ${notes.split('\n')[0].slice(0, 60)}`)
  console.log(`  提交审核   ${args.publish ? '是' : '否（只更新 draft）'}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('// 用法：')[1]
        ?.split('// 注意')[0] ?? '',
    )
    return
  }

  loadEnvFile()
  const config = readConfig()
  const target = resolveZip(args)
  const notes = resolveNotes(args, target.version)

  printPlan(config, target, notes, args)
  if (args.dryRun) {
    console.log('· --dry-run：未向 Edge 发起任何请求')
    return
  }

  const headers = await authHeaders(config)
  const base = `${API_ROOT}/${config.productId}/submissions`

  console.log(`→ 上传 ${target.zip} 到 draft`)
  const upload = await request(
    `${base}/draft/package`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/zip' },
      body: readFileSync(target.zip),
    },
    '上传包',
  )
  const uploadId = operationId(upload, '上传包')
  console.log(`  operation ${uploadId}`)
  process.stdout.write('→ 等待包处理')
  const uploadState = await pollOperation(`${base}/draft/package/operations/${uploadId}`, headers, {
    label: '包上传',
    timeoutMs: args.timeout,
  })
  if (uploadState.status !== 'Succeeded') {
    fail(
      `包未通过校验：${JSON.stringify(uploadState.errors ?? uploadState.message ?? uploadState)}`,
    )
  }

  if (!args.publish) {
    console.log('· 已按 --no-publish 停在 draft：可在 Partner Center 检查后手动提交审核')
    return
  }

  console.log('→ 提交 draft 进行认证')
  const publish = await request(
    base,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    },
    '提交审核',
  )
  const publishId = operationId(publish, '提交审核')
  console.log(`  operation ${publishId}`)
  process.stdout.write('→ 等待提交结果')
  const publishState = await pollOperation(`${base}/operations/${publishId}`, headers, {
    label: '提交审核',
    timeoutMs: args.timeout,
  })
  if (publishState.status !== 'Succeeded') {
    fail(
      `提交未成功：${JSON.stringify(publishState.errors ?? publishState.message ?? publishState)}`,
    )
  }

  console.log(`✓ Leafmark ${target.version} 已进入 Edge 商店认证流程`)
  console.log('  认证通常在数个工作日内完成，状态在 Partner Center 的扩展概览页查看。')
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
