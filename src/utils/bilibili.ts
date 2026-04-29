import { WBI } from './wbiBiliBili';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15'

/**
 * 获取视频信息 (完全重现 info/dowloadBiliBili.ts 的 HTML 解析逻辑)
 */
export const getVideoMsg = async (videoPath: string, sessData?: string): Promise<any> => {
    const isProd = import.meta.env.PROD;
    const proxyUrl = isProd
        ? `/api/download?url=${encodeURIComponent(videoPath)}`
        : `/bili-download?url=${encodeURIComponent(videoPath)}`;

    try {
        const config = {
            headers: {
                'User-Agent': `${UA}`,
                'X-Bili-Sessdata': sessData || ''
            }
        };

        const response = await fetch(proxyUrl, config);

        // 如果代理返回了重定向地址 (或者 response.url 发生了变化)
        if (response.redirected) {
            return await getVideoMsg(response.url, sessData);
        } else {
            const html = await response.text();
            const reg = /<script>window\.__INITIAL_STATE__=([\s\S]*?);\(function\(\)/;

            if (!html) throw new Error('获取视频信息失败: 源码为空');

            const matchResult = html.match(reg);
            if (!matchResult) throw new Error('获取视频信息失败: 未找到 INITIAL_STATE');

            const { videoData } = JSON.parse(matchResult[1]);
            return videoData;
        }
    } catch (error) {
        console.error('getVideoMsg 出错:', error);
        throw error;
    }
};

/**
 * 获取视频清晰度列表 (直接迁移自 info/dowloadBiliBili.ts)
 */
export const getAcceptQuality = async (cid: string | number, bvid: string, sessData?: string) => {
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

    const config = {
        headers: {
            'User-Agent': `${UA}`,
            'X-Bili-Sessdata': sessData || ''
        }
    }

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