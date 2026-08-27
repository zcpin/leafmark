// 打包 dist/ → leafmark-v{version}.zip（Chrome/Edge 商店上传产物）
// Windows 用 PowerShell Compress-Archive；其余平台回退 zip 命令
// 用法：pnpm zip （需先 pnpm build）
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('✗ dist/ 中没有 manifest.json，请先运行 pnpm build')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
const out = join(root, `leafmark-v${manifest.version}.zip`)

if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${out.replace(/\\/g, '\\\\')}' -Force"`,
    { stdio: 'inherit' },
  )
} else {
  execSync(`cd "${dist}" && zip -r -q "${out}" .`, { stdio: 'inherit' })
}
console.log(`✓ ${out}`)
