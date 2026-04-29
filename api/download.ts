export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  const referer = url.searchParams.get('referer') || 'https://www.bilibili.com';
  const sessData = req.headers.get('X-Bili-Sessdata') || process.env.BILI_SESSDATA;

  if (!targetUrl) {
    return new Response('Missing target url', { status: 400 });
  }

  const requestHeaders: Record<string, string> = {
    'Referer': referer,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (sessData) {
    requestHeaders['Cookie'] = `SESSDATA=${sessData}`;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: requestHeaders,
    });

    const newHeaders = new Headers(response.headers);
    // 强制添加 CORS 头，允许浏览器前端读取数据
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'X-Bili-Sessdata');

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}