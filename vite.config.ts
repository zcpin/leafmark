import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// 构建方案：手动模式（Plan B，见 docs/03-实现计划.md 风险表）
// - manifest.json 为 public/ 下静态文件，构建时原样复制到 dist/
// - 唯一 HTML 入口显式声明
// - 开发联动：pnpm watch（vite build --watch）+ 扩展页刷新
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: ['chrome111', 'edge111'],
    rollupOptions: {
      input: {
        newtab: fileURLToPath(new URL('./src/newtab/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    coverage: {
      include: ['src/lib/**', 'src/stores/**', 'src/composables/**', 'src/components/**/*.vue', 'src/newtab/App.vue'],
      reportsDirectory: 'artifacts/coverage',
      reporter: ['text-summary', 'html', 'json-summary'],
      thresholds: {
        statements: 80, lines: 80, functions: 80, branches: 70,
        'src/{lib,stores,composables}/**': { statements: 85, lines: 90, functions: 85, branches: 75 },
      },
    },
  },
})
