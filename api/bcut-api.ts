export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // 移除 /bcut-api 前缀并拼接目标地址
  const path = url.pathname.replace('/bcut-api', '');
  const targetUrl = new URL(path + url.search, 'https://member.bilibili.com');

  console.log(`[Bcut API Proxy] ${url.pathname} -> ${targetUrl.toString()}`);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: {
        'User-Agent': req.headers.get('user-agent') || '',
        'Referer': 'https://member.bilibili.com/x/bcut/asr',
        'Origin': 'https://member.bilibili.com',
        'Cookie': req.headers.get('cookie') || '',
        'Content-Type': req.headers.get('content-type') || '',
      },
      // GET/HEAD 请求不能有 body
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.blob(),
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
