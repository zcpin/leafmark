import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
    rollupOptions: {
      input: {
        newtab: fileURLToPath(new URL('./src/newtab/index.html', import.meta.url)),
      },
    },
  },
})
