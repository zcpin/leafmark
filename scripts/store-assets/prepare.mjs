import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderIcon } from '../generate-icons.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const assets = join(root, 'store-assets')
for (const dir of ['icons', 'promo', 'screenshots/en', 'screenshots/zh_CN', 'package', 'privacy']) {
  mkdirSync(join(assets, dir), { recursive: true })
}
writeFileSync(join(assets, 'icons/chrome-128.png'), renderIcon(128, 16))
writeFileSync(join(assets, 'icons/edge-300.png'), renderIcon(300))
writeFileSync(join(assets, 'icons/brand-512.png'), renderIcon(512))

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/https:\/\/github\.com\/zcpin\/leafmark\/issues/g, '<a href="https://github.com/zcpin/leafmark/issues">github.com/zcpin/leafmark/issues</a>')
const markdown = readFileSync(join(assets, 'privacy/PRIVACY.md'), 'utf8')
const body = markdown.trim().split(/\r?\n\s*\r?\n/).map((block) => {
  const heading = block.match(/^(#{1,3}) (.+)$/)
  if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`
  if (block.startsWith('- ')) return `<ul>${block.split(/\r?\n/).map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`
  return `<p>${inline(block).replaceAll('\n', ' ')}</p>`
}).join('\n')
writeFileSync(join(assets, 'privacy/privacy-policy.html'), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Leafmark Privacy Policy / 叶签隐私政策</title>
<style>body{margin:0;background:#f5faf7;color:#20342b;font:16px/1.8 system-ui,sans-serif}main{max-width:820px;margin:40px auto;padding:36px;background:white;border:1px solid #d9e7df;border-radius:16px}h1{font-size:28px;line-height:1.4}h2{margin-top:44px;border-bottom:1px solid #d9e7df;padding-bottom:10px}h3{margin-top:28px;font-size:18px}a{color:#087c57;overflow-wrap:anywhere}li{margin:8px 0}@media(max-width:700px){main{margin:0;padding:24px;border:0;border-radius:0}}</style></head>
<body><main>${body}</main></body></html>\n`, 'utf8')

const version = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8')).version
const zip = `leafmark-v${version}.zip`
if (existsSync(join(root, zip))) copyFileSync(join(root, zip), join(assets, 'package', zip))
console.log('Prepared store icons, standalone privacy policy, and available package.')
