export const config = {
  runtime: 'edge',
};

import { getNewSecToken } from './biliCaptcha';

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  const referer = url.searchParams.get('referer') || 'https://www.bilibili.com';
  const sessData = req.headers.get('X-Bili-Sessdata') || process.env.BILI_SESSDATA;

  if (!targetUrl) {
    return new Response('Missing target url', { status: 400 });
  }

  const baseHeaders: Record<string, string> = {
    'Referer': referer,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const secTokenIn = req.headers.get('X-Bili-Sec-Token');

  const getFullHeaders = (secToken?: string) => {
    const h = { ...baseHeaders };
    let cookieStr = '';
    if (sessData) cookieStr += `SESSDATA=${sessData}; `;
    // 优先使用传入的 secToken，如果没有则使用请求头里的
    const finalToken = secToken || secTokenIn;
    if (finalToken) cookieStr += `X-BILI-SEC-TOKEN=${finalToken}; `;
    if (cookieStr) h['Cookie'] = cookieStr;
    return h;
  };

  let newTokenFound = '';

  try {
    let response = await fetch(targetUrl, { headers: getFullHeaders() });

    // 处理 412 风险控制
    if (response.status === 412) {
      console.log('[Download] 412 detected, attempting to solve challenge...');
      const setCookie = response.headers.get('set-cookie');
      if (setCookie && setCookie.includes('X-BILI-SEC-TOKEN')) {
        const newToken = await getNewSecToken(setCookie);
        
        if (newToken) {
          console.log('[Download] Challenge solved, retrying with new token...');
          newTokenFound = newToken;
          response = await fetch(targetUrl, { headers: getFullHeaders(newToken) });
        }
      }
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Bili-Sessdata, X-Bili-Sec-Token');
    newHeaders.set('Access-Control-Expose-Headers', 'X-Bili-Sec-Token');

    // 如果我们刚刚通过挑战获取了新 Token，把它传给前端
    if (response.status === 200 && newTokenFound) {
      newHeaders.set('X-Bili-Sec-Token', newTokenFound);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}