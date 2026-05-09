import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { IncomingMessage } from 'http'

// 自定义插件：用于开发环境拦截并代理 bilibili 视频下载流
const biliProxyPlugin = () => ({
  name: 'bili-download-proxy',
  configureServer(server: any) {
    server.middlewares.use(async (req: IncomingMessage, res: any, next: any) => {
      if (req.url?.startsWith('/bili-download')) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const targetUrl = urlObj.searchParams.get('url');
        const referer = urlObj.searchParams.get('referer');
        const sessData = req.headers['x-bili-sessdata'] as string;

        if (!targetUrl) {
          res.statusCode = 400;
          res.end('Missing target url');
          return;
        }

        try {
          const fetchRes = await fetch(targetUrl, {
            headers: {
              'Referer': referer || 'https://www.bilibili.com',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cookie': sessData ? `SESSDATA=${sessData}` : ''
            }
          });

          res.setHeader('Content-Type', fetchRes.headers.get('Content-Type') || 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');

          const arrayBuffer = await fetchRes.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      } else {
        next();
      }
    });
  }
});

// 自定义插件：用于开发环境代理必剪的动态 BOS 节点上传 (PUT请求)
const bcutUploadProxyPlugin = () => ({
  name: 'bcut-upload-proxy',
  configureServer(server: any) {
    server.middlewares.use(async (req: IncomingMessage, res: any, next: any) => {
      if (req.url?.startsWith('/bcut-upload-proxy/')) {
        const match = req.url.match(/^\/bcut-upload-proxy\/(http|https)\/([^\/]+)(.*)$/);
        if (!match) return next();
        
        const targetUrl = `${match[1]}://${match[2]}${match[3]}`;

        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.statusCode = 200;
          return res.end();
        }

        if (req.method === 'PUT') {
          try {
            const chunks: any[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const body = Buffer.concat(chunks);

            const fetchRes = await fetch(targetUrl, {
              method: 'PUT',
              headers: {
                'Referer': 'https://member.bilibili.com/',
                'Origin': 'https://member.bilibili.com',
                'User-Agent': req.headers['user-agent'] || '',
              },
              body
            });

            const etag = fetchRes.headers.get('etag') || fetchRes.headers.get('Etag');
            if (etag) {
              res.setHeader('Etag', etag);
              res.setHeader('Access-Control-Expose-Headers', 'Etag, etag');
            }
            
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
            res.statusCode = fetchRes.status;
            res.end(await fetchRes.text());
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        } else {
          next();
        }
      } else {
        next();
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const musicResolveTarget = env.B23_RESOLVE_API || 'http://localhost:3000';

  return {
    plugins: [vue(), biliProxyPlugin(), bcutUploadProxyPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // 代理解析接口，支持 Bilibili 和网易云
        '/music-api': {
          target: musicResolveTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/music-api/, '')
        },
        // 代理第三方网易云下载接口
        '/gdstudio-api': {
          target: 'https://music-api.gdstudio.xyz',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/gdstudio-api/, ''),
          headers: {
            'Referer': 'https://music-api.gdstudio.xyz',
            'Origin': 'https://music-api.gdstudio.xyz'
          }
        },
        // 代理 Bilibili API
        '/bili-api': {
          target: 'https://api.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bili-api/, ''),
          headers: {
            'Referer': 'https://www.bilibili.com',
            'Origin': 'https://www.bilibili.com'
          }
        },
        // 代理必剪 ASR 接口
        '/bcut-api': {
          target: 'https://member.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bcut-api/, ''),
          headers: {
            'Referer': 'https://member.bilibili.com/x/bcut/asr',
            'Origin': 'https://member.bilibili.com'
          }
        },
        // 代理必剪上传接口 (BOS 存储)
        '/bcut-upload': {
          target: 'https://boss.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bcut-upload/, ''),
          headers: {
            'Referer': 'https://member.bilibili.com/',
            'Origin': 'https://member.bilibili.com'
          }
        }
      }
    }
  }
})
