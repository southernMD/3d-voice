/**
 * 解析网易云音乐链接获取歌曲 ID
 */
export async function parseNeteaseUrl(url: string): Promise<string | null> {
    // 0. 从杂乱的分享字符串中提取真正的 URL
    const urlRegex = /(https?:\/\/[^\s]+)/;
    const urlMatch = url.match(urlRegex);
    const finalUrl = urlMatch ? urlMatch[0] : url;

    try {
        // 调用后端解析接口 (支持短链解析和 ID 提取)
        const res = await fetch(`/music-api/resolve/netease?url=${encodeURIComponent(finalUrl)}`);
        const json = await res.json();

        if (json.success && json.data.songId) {
            return json.data.songId;
        }
    } catch (e) {
        console.error('解析网易云链接失败:', e);
    }

    // 备选方案：前端正则匹配
    const idReg = /id=(\d+)/;
    const match = finalUrl.match(idReg);
    return match ? match[1] : null;
}

/**
 * 获取歌曲信息
 */
export async function getNeteaseMusicMsg(url: string) {
    // 1. 解析 URL 获取 ID
    const id = await parseNeteaseUrl(url);
    if (!id) throw new Error('无效的网易云链接');

    try {
        // 2. 获取歌曲元数据 (WEAPI /v3/song/detail)
        const detailRes = await fetch(`/music-api/resolve/netease/detail?id=${id}`);
        const detailJson = await detailRes.json();

        // 3. 获取真实播放链接 (走代理接口)
        const streamRes = await fetch(`/gdstudio-api/api.php?types=url&id=${id}`);
        const streamJson = await streamRes.json();
        const realAudioUrl = streamJson.url;

        if (!realAudioUrl) throw new Error('无法获取有效的播放链接');

        if (detailJson.success && detailJson.data.songs && detailJson.data.songs.length > 0) {
            const song = detailJson.data.songs[0];
            return {
                id: song.id,
                name: song.name,
                // V3 接口歌手字段为 ar，专辑字段为 al
                artist: song.ar ? song.ar.map((a: any) => a.name).join(', ') : '未知歌手',
                picUrl: song.al ? song.al.picUrl : '',
                url: realAudioUrl // 使用从代理接口获取的真实地址
            };
        }
        throw new Error('未找到歌曲元数据信息');
    } catch (e) {
        console.error('获取网易云音乐信息失败:', e);
        throw e;
    }
}
