import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Monaco 本身体积较大，已通过动态 import 拆分为独立 chunk
    chunkSizeWarningLimit: 4000
  }
})
