import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue'

// 自定义 B 站下载代理插件，解决动态域名和 Referer 问题
const biliProxyPlugin = (env: Record<string, string>) => ({
  name: 'bili-proxy',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/bili-download')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const targetUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('referer');
        // 优先使用请求头，没有则使用环境变量
        const sessData = req.headers['x-bili-sessdata'] || env.BILI_SESSDATA;

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue(), biliProxyPlugin(env)],
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
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const sessData = req.headers['x-bili-sessdata'] || env.BILI_SESSDATA;
              if (sessData) {
                proxyReq.setHeader('Cookie', `SESSDATA=${sessData}`);
              }
            });
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
  }
})