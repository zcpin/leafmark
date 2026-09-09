import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemoTree } from '../../store-assets/source/demo-data.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const portIndex = process.argv.indexOf('--port')
const browserPort = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 9346)
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const base = pathname.startsWith('/store-assets/') ? resolve(root, 'store-assets') : resolve(root, 'dist')
    const relative = pathname.startsWith('/store-assets/') ? pathname.slice('/store-assets/'.length) : pathname.slice(1)
    const file = resolve(base, relative)
    if (!file.startsWith(base + sep) || !(await stat(file)).isFile()) throw new Error('Not found')
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end('Not found') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`
const version = await (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).json()
const endpoint = new URL(version.webSocketDebuggerUrl)
assert.equal(endpoint.hostname, '127.0.0.1')
assert.equal(endpoint.port, String(browserPort))
const socket = new WebSocket(endpoint.href)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const errors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(new Error(message.error.message))
  else request.resolve(message.result)
})
function call(method, params = {}, sessionId) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
const page = (method, params) => call(method, params, sessionId)
async function evaluate(expression) {
  const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Page condition not reached: ${expression}`)
}
async function capture(file) {
  await call('Target.activateTarget', { targetId })
  await evaluate('document.fonts.ready.then(() => true)')
  await new Promise(resolve => setTimeout(resolve, 250))
  const image = await page('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await writeFile(resolve(root, 'store-assets', file), Buffer.from(image.data, 'base64'))
  console.log(`Captured ${file}`)
}

try {
  await page('Page.enable')
  await page('Runtime.enable')
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `
    const locale = new URLSearchParams(location.search).get('locale') === 'zh_CN' ? 'zh-CN' : 'en-US';
    Object.defineProperty(navigator, 'language', {configurable:true, get:() => locale});
    Object.defineProperty(navigator, 'languages', {configurable:true, get:() => [locale]});
    try { localStorage.setItem('onboardingCompleted', 'true'); } catch {}
  ` })
  for (const locale of ['en', 'zh_CN']) {
    await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await page('Page.navigate', { url: `${baseUrl}/src/newtab/index.html?locale=${locale}` })
    await waitFor(`Boolean(document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('settings')?.ready)`)
    const demo = JSON.stringify(createDemoTree(locale))
    await evaluate(`(async () => {
      window.stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      window.settings = stores._s.get('settings'); window.bookmarks = stores._s.get('bookmarks');
      await bookmarks.load(); bookmarks.tree = ${demo}; bookmarks.viewFolderId = null;
      await settings.setHomeFolderId(null); await settings.setTheme('light'); await settings.setSolidBg('gradient-emerald');
      await settings.setLayout({cardWidth:190,cardHeight:48,containerWidth:88});
      await settings.setGlassTransparency(15); await settings.setDisplay({clock:true,yearProgress:true,stats:true});
      return true;
    })()`)
    await waitFor(`document.querySelectorAll('.bookmark-card').length === 24`)
    await capture(`screenshots/${locale}/01-home-light.png`)

    const settingsName = locale === 'en' ? 'Settings' : '设置'
    const closeName = locale === 'en' ? 'Close' : '关闭'
    await evaluate(`document.querySelector('header button[aria-label="${settingsName}"]').click()`)
    await waitFor(`Boolean(document.querySelector('aside img[alt="Foggy Forest"]'))`)
    await evaluate(`document.querySelector('aside img[alt="Foggy Forest"]').closest('button').click()`)
    await waitFor(`settings.bgKind === 'wallpaper'`)
    await evaluate(`document.querySelector('aside button[aria-label="${closeName}"]').click(); settings.setTheme('dark')`)
    await waitFor(`!document.querySelector('aside') && document.documentElement.dataset.theme === 'dark'`)
    await capture(`screenshots/${locale}/02-home-dark.png`)

    await evaluate(`(async () => { await settings.setTheme('light'); await settings.setSolidBg('gradient-emerald'); await settings.setGlassTransparency(0); document.querySelector('.bookmark-card[role="button"]').click(); return true; })()`)
    await waitFor(`document.querySelectorAll('.fixed.z-40').length === 1`)
    await evaluate(`document.querySelector('.fixed.z-40 .bookmark-card[role="button"]').click()`)
    await waitFor(`document.querySelectorAll('.fixed.z-40').length === 2`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.fixed.z-40')).every(el => { const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight; })`), true)
    await capture(`screenshots/${locale}/03-folder-preview.png`)
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',cancelable:true}))`)

    await evaluate(`(async () => { window.duplicates=stores._s.get('duplicates'); duplicates.show(); await bookmarks.load(); bookmarks.tree=${demo}; return true; })()`)
    await waitFor(`Boolean(duplicates.groups.length && document.querySelector('[role="dialog"]'))`)
    await evaluate(`duplicates.toggle(duplicates.groups[0].links[0], true)`)
    await capture(`screenshots/${locale}/04-duplicates.png`)
    await evaluate('duplicates.hide()')
    await waitFor(`!document.querySelector('[role="dialog"]')`)

    await evaluate(`document.querySelector('header button[aria-label="${settingsName}"]').click()`)
    await waitFor(`Boolean(document.querySelector('aside'))`)
    await capture(`screenshots/${locale}/05-settings.png`)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  }
  for (const [format, width, height, file] of [
    ['small', 440, 280, 'promo/small-440x280.png'],
    ['marquee', 1400, 560, 'promo/marquee-1400x560.png'],
  ]) {
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await page('Page.navigate', { url: `${baseUrl}/store-assets/source/promo.html?format=${format}` })
    await waitFor(`Boolean(document.querySelector('.brand img')?.complete && document.querySelector('.brand img')?.naturalWidth)`)
    await capture(file)
  }
  assert.deepEqual(errors, [], 'Unexpected page errors during capture')
  console.log(`Captured 10 localized screenshots and 2 promotional images using ${version.Browser}.`)
} finally {
  await call('Target.closeTarget', { targetId }).catch(() => {})
  socket.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
