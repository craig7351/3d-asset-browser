import { defineConfig } from 'vite'

// base 設為相對路徑，讓打包後用 file:// 載入也能正常找到資源
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
