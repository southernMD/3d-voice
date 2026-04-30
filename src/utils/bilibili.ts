import { WBI } from './wbiBiliBili';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15'

/**
 * 解析 B 站链接获取 BVID
 */
export function parseBilibiliUrl(url: string): string | null {
    const bvidReg = /BV[a-zA-Z0-9]{10}/;
    const match = url.match(bvidReg);
    return match ? match[0] : null;
}

/**
 * 获取视频信息 (迁移自 info/dowloadBiliBili.ts)
 */
export const getVideoMsg = async (videoPath: string, sessData?: string) => {
    // 0. 从杂乱的分享字符串中提取真正的 URL
    const urlRegex = /(https?:\/\/[^\s]+)/;
    const urlMatch = videoPath.match(urlRegex);

    if (!urlMatch) {
        throw new Error('未在输入中找到有效的 B 站链接');
    }

    let finalPath = urlMatch[0];

    // 1. 识别并解析 b23.tv 短链接
    if (finalPath.includes('b23.tv/')) {
        try {
            // 使用相对路径，由 Vite (开发) 或 Vercel (生产) 代理转发
            const res = await fetch(`/music-api/resolve/bilibili?url=${encodeURIComponent(finalPath)}`);
            const json = await res.json();
            if (json.success && json.data.resolved) {
                finalPath = json.data.resolved;
            }
        } catch (e) {
            console.error('解析短链失败:', e);
        }
    }

    const bvid = parseBilibiliUrl(finalPath);
    if (!bvid) throw new Error('无效的 B 站链接');

    const config = {
        headers: {
            'User-Agent': `${UA}`,
            'X-Bili-Sessdata': sessData || ''
        }
    }

    const res = await fetch(`/bili-api/x/web-interface/view?bvid=${bvid}`, config);
    const { data } = await res.json();
    return data;
};

/**
 * 获取视频清晰度列表 (直接迁移自 info/dowloadBiliBili.ts)
 */
export const getAcceptQuality = async (cid: string | number, bvid: string, sessData?: string) => {
    const config = {
        headers: {
            'User-Agent': `${UA}`,
            'X-Bili-Sessdata': sessData || ''
        }
    }
    const newApiParams = await WBI(sessData, {
        cid: `${cid}`,
        bvid: `${bvid}`,
        qn: "127",
        type: "",
        otype: "json",
        fourk: "1",
        fnver: "0",
        fnval: "80",
        session: "68191c1dc3c75042c6f35fba895d65b0",
        gaia_source: `${sessData}`
    })

    const result = await fetch(`/bili-api/x/player/wbi/playurl?${newApiParams}`, config);
    return await result.json()
}

/**
 * 获取播放数据 (直接迁移自 info/dowloadBiliBili.ts)
 */
export const getVideoDowloadLink = async (cid: string | number, bvid: string, sessData?: string) => {
    const acceptQuality = await getAcceptQuality(cid, bvid, sessData);
    return {
        accept_description: acceptQuality.data.accept_description,
        accept_quality: acceptQuality.data.accept_quality,
        video: getHighQualityVideo(acceptQuality.data.dash.video),
        audio: getHighQualityAudio(acceptQuality.data.dash.audio)
    };
}

const getHighQualityAudio = (audioArray: any[]) => {
    return audioArray.sort((a, b) => b.id - a.id)[0]
}

const getHighQualityVideo = (videoArray: any[]) => {
    return videoArray.sort((a, b) => b.id - a.id)[0]
}
