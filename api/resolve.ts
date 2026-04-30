export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetHost = process.env.B23_RESOLVE_API;
  
  if (!targetHost) {
    return new Response(JSON.stringify({ error: 'B23_RESOLVE_API environment variable is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 提取路径和查询参数
  // 例如：/music-api/resolve?url=... -> /resolve?url=...
  const path = url.pathname.replace('/music-api', '');
  const targetUrl = new URL(path + url.search, targetHost);

  console.log(`[Proxy] Forwarding to: ${targetUrl.toString()}`);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.blob() : undefined,
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