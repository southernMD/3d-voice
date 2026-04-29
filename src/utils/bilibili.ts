import md5 from 'md5';

/**
 * Bilibili WBI 签名工具与 API 服务 (浏览器兼容版)
 */

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

const getMixinKey = (orig: string) => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);

function encWbi(params: any, img_key: string, sub_key: string) {
  const mixin_key = getMixinKey(img_key + sub_key);
  const curr_time = Math.round(Date.now() / 1000);
  const chr_filter = /[!'()*]/g;

  Object.assign(params, { wts: curr_time });
  const query = Object.keys(params)
    .sort()
    .map(key => {
      const value = params[key].toString().replace(chr_filter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  const wbi_sign = md5(query + mixin_key);
  return query + '&w_rid=' + wbi_sign;
}

export async function getWbiKeys(sessData?: string) {
  // 使用 Vite 代理避免跨域
  const url = sessData ? `/bili-api/x/web-interface/nav` : `/bili-api/x/web-interface/nav`;
  const res = await fetch(url);
  const { data: { wbi_img: { img_url, sub_url } } } = await res.json();

  return {
    img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
    sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'))
  };
}

/**
 * 解析 B 站链接获取 BVID
 */
export function parseBilibiliUrl(url: string): string | null {
  const bvidReg = /BV[a-zA-Z0-9]{10}/;
  const match = url.match(bvidReg);
  return match ? match[0] : null;
}

/**
 * 获取视频详情
 */
export async function getVideoInfo(bvid: string) {
  const res = await fetch(`/bili-api/x/web-interface/view?bvid=${bvid}`);
  const { data } = await res.json();
  return data;
}

/**
 * 获取播放地址 (DASH 格式)
 */
export async function getPlayUrl(bvid: string, cid: number, sessData?: string) {
  const keys = await getWbiKeys(sessData);
  const params = {
    cid: `${cid}`,
    bvid: `${bvid}`,
    qn: "127",
    type: "",
    otype: "json",
    fourk: "1",
    fnver: "0",
    fnval: "80", // 80 代表 DASH 格式
  };

  const query = encWbi(params, keys.img_key, keys.sub_key);
  const res = await fetch(`/bili-api/x/player/wbi/playurl?${query}`);
  const { data } = await res.json();
  return data;
}

/**
 * 核心功能：通过链接获取音频 Blob
 * 注意：由于 B 站 CDN 严格校验 Referer，直接 fetch 会失败
 * 这里我们建议用户使用代理或通过音频系统处理
 */
export async function fetchBiliAudio(audioUrl: string): Promise<Blob> {
    // 这里是一个通用的解决跨域 Referer 限制的代理思路 (需配合后端或特定 Proxy)
    // 暂时假设用户可以使用本地代理或环境已支持
    const response = await fetch(audioUrl); 
    return await response.blob();
}
