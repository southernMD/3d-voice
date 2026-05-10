export const config = {
  runtime: 'edge',
};

/**
 * Vercel Serverless Function: AI 接口代理
 * 处理智谱 AI 的 API 调用并注入环境变量中的 API Key
 */
export default async function handler(req: Request) {
  const apiKey = process.env.AI_API_KEY;

  // 1. 校验环境变量是否存在
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing AI_API_KEY in Vercel environment variables' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 智谱 AI 官方接口地址
  const targetUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  try {
    // 2. 转发请求，注入鉴权头
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      // 转发原始请求体
      body: await req.blob(),
    });

    // 3. 构造返回头，支持跨域
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: newHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    console.error('[Vercel AI Proxy Error]:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
