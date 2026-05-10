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

  // 2. 校验环境变量是否存在
  const rawKey = process.env.AI_API_KEY;
  if (!rawKey) {
    console.error('[Vercel AI Proxy] Error: AI_API_KEY is not defined');
    return new Response(JSON.stringify({ error: 'Missing AI_API_KEY' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 清洗 Key：去除首尾空格、去除可能的双引号/单引号
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

  // 智谱 AI 官方接口地址
  const targetUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  try {
    const body = await req.text();
    console.log(`[Vercel AI Proxy] Forwarding... KeyLength: ${apiKey.length}, Prefix: ${apiKey.slice(0, 4)}`);

    // 3. 转发请求
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
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
