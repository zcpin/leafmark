import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync, inflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const assets = join(root, 'store-assets')
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))
const images = [
  ['icons/chrome-128.png', 128, 128, 6], ['icons/edge-300.png', 300, 300, 6], ['icons/brand-512.png', 512, 512, 6],
  ['promo/small-440x280.png', 440, 280, 2], ['promo/marquee-1400x560.png', 1400, 560, 2],
  ...['en', 'zh_CN'].flatMap(locale => ['01-home-light', '02-home-dark', '03-folder-preview', '04-duplicates', '05-settings'].map(name => [`screenshots/${locale}/${name}.png`, 1280, 800, 2])),
]
const imageInfo = new Map()
for (const [file, width, height, colorType] of images) {
  const png = readFileSync(join(assets, file))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file)
  assert.equal(png.readUInt32BE(16), width, file)
  assert.equal(png.readUInt32BE(20), height, file)
  assert.equal(png[24], 8, file)
  assert.equal(png[25], colorType, `${file}: screenshots and promo images must be RGB; logos use RGBA`)
  imageInfo.set(file, { width, height, bitDepth: 8, colorType })
}
const chromeIcon = readFileSync(join(assets, 'icons/chrome-128.png'))
assert.deepEqual(chromeIcon, readFileSync(join(root, 'public/icons/icon-128.png')))
const idat = []
for (let offset = 8; offset < chromeIcon.length;) {
  const length = chromeIcon.readUInt32BE(offset)
  if (chromeIcon.toString('ascii', offset + 4, offset + 8) === 'IDAT') idat.push(chromeIcon.subarray(offset + 8, offset + 8 + length))
  offset += 12 + length
}
const pixels = inflateSync(Buffer.concat(idat))
for (let y = 0; y < 128; y++) {
  assert.equal(pixels[y * 513], 0, 'Expected the icon generator unfiltered PNG')
  for (let x = 0; x < 128; x++) if (x < 16 || x >= 112 || y < 16 || y >= 112) assert.equal(pixels[y * 513 + 1 + x * 4 + 3], 0, 'Chrome icon padding must be transparent')
}
for (const locale of ['en', 'zh_CN']) {
  const name = readFileSync(join(assets, 'listings', locale, 'name.txt'), 'utf8').trim()
  const summary = readFileSync(join(assets, 'listings', locale, 'short-description.txt'), 'utf8').trim()
  const description = readFileSync(join(assets, 'listings', locale, 'description.txt'), 'utf8').trim()
  assert.ok(Array.from(name).length <= 45)
  assert.ok(Array.from(summary).length <= 132)
  assert.ok(description.length >= 250 && description.length <= 10000)
  const messages = JSON.parse(readFileSync(join(root, 'public/_locales', locale, 'messages.json'), 'utf8'))
  assert.equal(messages.extName.message, name)
  assert.equal(messages.extDescription.message, summary)
}

const packageFile = `package/leafmark-v${manifest.version}.zip`
const zip = readFileSync(join(assets, packageFile))
let end = zip.length - 22
while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--
assert.ok(end >= 0, 'ZIP central directory not found')
let cursor = zip.readUInt32LE(end + 16)
const entries = new Map()
for (let count = 0; count < zip.readUInt16LE(end + 10); count++) {
  assert.equal(zip.readUInt32LE(cursor), 0x02014b50)
  const nameLength = zip.readUInt16LE(cursor + 28)
  const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength).replaceAll('\\', '/')
  const offset = zip.readUInt32LE(cursor + 42)
  const dataOffset = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28)
  const data = zip.subarray(dataOffset, dataOffset + zip.readUInt32LE(cursor + 20))
  entries.set(name, zip.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(data) : data)
  cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32)
}
assert.deepEqual(JSON.parse(entries.get('manifest.json').toString('utf8')), manifest)
assert.deepEqual(entries.get('icons/icon-128.png'), chromeIcon)
assert.ok(entries.has(manifest.chrome_url_overrides.newtab))
assert.deepEqual(manifest.permissions, ['bookmarks', 'favicon', 'storage', 'tabGroups'])
assert.equal(manifest.minimum_chrome_version, '111')

const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)])
const files = walk(assets).map(file => relative(assets, file).replaceAll('\\', '/')).filter(file => !['asset-manifest.json', 'SHA256SUMS.txt'].includes(file)).sort()
const inventory = files.map(file => {
  const bytes = readFileSync(join(assets, file))
  return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...(imageInfo.get(file) ?? {}) }
})
writeFileSync(join(assets, 'asset-manifest.json'), JSON.stringify({ extensionVersion: manifest.version, preparedOn: '2026-09-09', minimumChromeVersion: manifest.minimum_chrome_version, requiredPermissions: manifest.permissions, optionalHostPermissions: manifest.optional_host_permissions, submissionStatus: 'candidate-requires-public-privacy-url-and-publisher-dashboard', files: inventory }, null, 2) + '\n', 'utf8')
writeFileSync(join(assets, 'SHA256SUMS.txt'), inventory.map(file => `${file.sha256}  ${file.file}`).join('\n') + '\n', 'utf8')
console.log(`Validated ${images.length} PNG assets, both listings, and the ${entries.size}-file extension ZIP (${zip.length} bytes).`)
