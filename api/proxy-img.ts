export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  const targetUrl = `https://i0.hdslb.com/${path}`;

  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://www.bilibili.com',
    },
  });

  const data = await response.arrayBuffer();
  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
