export const config = {
  runtime: 'edge',
};

import { getNewSecToken } from './biliCaptcha';

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  url.searchParams.delete('path');

  const targetUrl = `https://api.bilibili.com/${path}${url.search}`;

  const sessData = req.headers.get('X-Bili-Sessdata') || process.env.BILI_SESSDATA;
  const baseHeaders: Record<string, string> = {
    'Referer': 'https://www.bilibili.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const getFullHeaders = (secToken?: string) => {
    const h = { ...baseHeaders };
    let cookieStr = '';
    if (sessData) cookieStr += `SESSDATA=${sessData}; `;
    if (secToken) cookieStr += `X-BILI-SEC-TOKEN=${secToken}; `;
    if (cookieStr) h['Cookie'] = cookieStr;
    return h;
  };

  try {
    let response = await fetch(targetUrl, { headers: getFullHeaders() });

    // 处理 412 风险控制
    if (response.status === 412) {
      console.log('[Proxy] 412 detected, attempting to solve challenge...');
      const setCookie = response.headers.get('set-cookie');
      if (setCookie && setCookie.includes('X-BILI-SEC-TOKEN')) {
        const newToken = await getNewSecToken(setCookie);
        
        if (newToken) {
          console.log('[Proxy] Challenge solved, retrying with new token...');
          response = await fetch(targetUrl, { headers: getFullHeaders(newToken) });
        }
      }
    }

    const data = await response.arrayBuffer();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Bili-Sessdata',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ code: -500, message: 'Proxy Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}