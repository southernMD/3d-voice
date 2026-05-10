export const config = {
  runtime: 'edge',
};

/**
 * Vercel Serverless Function: AI 接口代理
 * 处理智谱 AI 的 API 调用并注入环境变量中的 API Key
 */
export default async function handler(req: Request) {
  // 1. 优先处理 OPTIONS 预检请求 (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const apiKey = process.env.AI_API_KEY;

  // 2. 校验环境变量是否存在
  if (!apiKey) {
    console.error('[Vercel AI Proxy] Error: AI_API_KEY is not defined');
    return new Response(JSON.stringify({ error: 'Missing AI_API_KEY in Vercel environment variables' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 智谱 AI 官方接口地址
  const targetUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  try {
    // 3. 准备请求头，使用显式的 Headers 对象以确保稳定性
    const requestHeaders = new Headers();
    requestHeaders.set('Content-Type', 'application/json');
    requestHeaders.set('Authorization', `Bearer ${apiKey}`);

    // 获取原始请求体
    const body = await req.text();

    console.log(`[Vercel AI Proxy] Forwarding to BigModel. Key prefix: ${apiKey.slice(0, 6)}...`);

    // 4. 转发请求
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: body,
    });

    // 5. 构造返回头
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Vercel AI Proxy Error]:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
