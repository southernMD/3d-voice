export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // 移除 /gdstudio-api 前缀并拼接目标地址
  const path = url.pathname.replace('/gdstudio-api', '');
  const targetUrl = new URL(path + url.search, 'https://music-api.gdstudio.xyz');

  console.log(`[Gdstudio Proxy] ${url.pathname} -> ${targetUrl.toString()}`);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: {
        'User-Agent': req.headers.get('user-agent') || '',
        'Referer': 'https://music-api.gdstudio.xyz',
        'Origin': 'https://music-api.gdstudio.xyz'
      },
      // GET 请求不能有 body
      body: req.method === 'GET' ? undefined : req.body,
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
