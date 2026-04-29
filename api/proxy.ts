export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  url.searchParams.delete('path');

  const targetUrl = `https://api.bilibili.com/${path}${url.search}`;

  // 从自定义头中读取 SESSDATA 并转换为 B 站的 Cookie，支持环境变量作为默认值
  const sessData = req.headers.get('X-Bili-Sessdata') || process.env.BILI_SESSDATA;
  const headers: Record<string, string> = {
    'Referer': 'https://www.bilibili.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (sessData) {
    headers['Cookie'] = `SESSDATA=${sessData}`;
  }

  try {
    const response = await fetch(targetUrl, { headers });
    const data = await response.arrayBuffer();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Bili-Sessdata',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ code: -500, message: 'Proxy Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}