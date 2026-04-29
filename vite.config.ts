import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // 代理 B 站 API
      '/bili-api': {
        target: 'https://api.bilibili.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-api/, ''),
        headers: {
          'Referer': 'https://www.bilibili.com',
          'Origin': 'https://www.bilibili.com'
        }
      },
      // 代理 B 站封面
      '/bili-img': {
        target: 'https://i0.hdslb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-img/, ''),
        headers: {
          'Referer': 'https://www.bilibili.com'
        }
      }
    }
  }
})
