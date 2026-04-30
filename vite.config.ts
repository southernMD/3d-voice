import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue'

// 自定义 B 站下载代理插件
const biliProxyPlugin = () => ({
  name: 'bili-proxy',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/bili-download')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const targetUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('referer');
        const sessData = req.headers['x-bili-sessdata'];

        if (!targetUrl) return next();

        try {
          const response = await fetch(targetUrl, {
            headers: {
              'Referer': referer || 'https://www.bilibili.com',
              'User-Agent': 'Mozilla/5.0',
              'Cookie': sessData ? `SESSDATA=${sessData}` : ''
            }
          });

          res.writeHead(response.status, {
            'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
          });

          if (response.body) {
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          }
          res.end();
        } catch (e) {
          res.statusCode = 500;
          res.end('Proxy Error');
        }
        return;
      }
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const b23ResolveTarget = env.B23_RESOLVE_API || 'http://localhost:3000';

  return {
    plugins: [vue(), biliProxyPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // 代理短链解析接口，目标地址从环境变量读取
        '/b23-api': {
          target: b23ResolveTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/b23-api/, '')
        },
        '/bili-api': {
          target: 'https://api.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bili-api/, ''),
          headers: {
            'Referer': 'https://www.bilibili.com',
            'Origin': 'https://www.bilibili.com'
          }
        },
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
  };
});
