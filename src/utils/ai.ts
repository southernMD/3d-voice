import { h, reactive } from 'vue';
import { showConfirm } from '../components/common/ConfirmDialog';
import MusicInfoEditContent from '../components/common/dialogs/MusicInfoEditContent.vue';
import MusicSelectionContent from '../components/common/dialogs/MusicSelectionContent.vue';
import {
    baseExtractMusicInfo,
    baseAnalyzeEmotion,
    baseValidateAsr
} from './ai-core';
import type { LyricEmotion, MusicInfo } from '@/types/music';



/**
 * 计算两个字符串的相似度 (基于编辑距离)
 */
export function getSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();
    if (s1 === s2) return 1;

    const l1 = s1.length;
    const l2 = s2.length;
    const matrix = Array.from({ length: l1 + 1 }, () => Array(l2 + 1).fill(0));

    for (let i = 0; i <= l1; i++) matrix[i][0] = i;
    for (let j = 0; j <= l2; j++) matrix[0][j] = j;

    for (let i = 1; i <= l1; i++) {
        for (let j = 1; j <= l2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    const distance = matrix[l1][l2];
    return 1 - distance / Math.max(l1, l2);
}

/**
 * 提取歌曲名和歌手 (包含交互微调)
 */
export async function extractMusicInfo(text: string, interactive: boolean = false): Promise<MusicInfo> {
    const info = await baseExtractMusicInfo(text);

    // 如果处于交互模式且识别到了东西，允许用户手动编辑
    if (interactive && (info.name || info.artist)) {
        const state = reactive({ name: info.name || '', artist: info.artist || '' });
        const ok = await showConfirm({
            title: '微调歌曲信息',
            content: () => h(MusicInfoEditContent, {
                name: state.name,
                artist: state.artist,
                'onUpdate:name': (v: string) => state.name = v,
                'onUpdate:artist': (v: string) => state.artist = v
            })
        });

        if (ok) {
            console.log(`[Manual Edit] 用户修改为: ${state.name} - ${state.artist}`);
            return { name: state.name, artist: state.artist };
        }
    }

    return info;
}

/**
 * 搜索并匹配最合适的歌曲 ID
 */
export async function searchAndGetBestMatchId(name: string, artist: string | null, interactive: boolean = false): Promise<string | null> {
    try {
        const res = await fetch(`/gdstudio-api/api.php?types=search&name=${encodeURIComponent(name)}&count=5`);
        const results = await res.json();

        if (!Array.isArray(results) || results.length === 0) return null;

        let bestId: string | null = null;
        let maxSim = -1;

        for (const item of results) {
            let sim = getSimilarity(name, item.name);
            if (artist && item.artist) {
                const artists = Array.isArray(item.artist) ? item.artist : [item.artist];
                let artistSim = 0;
                for (const a of artists) {
                    artistSim = Math.max(artistSim, getSimilarity(artist, String(a)));
                }
                sim = sim * 0.6 + artistSim * 0.4;
            }
            console.log("[AI] 歌曲置信度匹配结果:", item.name, item.artist, sim);
            if (sim > maxSim) {
                maxSim = sim;
                bestId = item.id;
            }
        }

        const forceManual = interactive && !artist;

        if (maxSim > 0.4 && !forceManual) {
            return bestId;
        } else if (interactive && results.length > 0) {
            const state = reactive({ index: 0 });
            const ok = await showConfirm({
                title: `歌曲 "${name}${artist ? ' - ' + artist : ''}" 自动匹配不确定`,
                content: () => h(MusicSelectionContent, {
                    modelValue: state.index,
                    'onUpdate:modelValue': (v: number) => state.index = v,
                    candidates: results.map((item: any) => ({
                        id: item.id,
                        name: item.name,
                        artist: Array.isArray(item.artist) ? item.artist.join('/') : item.artist
                    }))
                })
            });

            if (ok) {
                console.log(`[Manual Select] 用户选择了: ${results[state.index].name}`);
                return results[state.index].id;
            }
        }

        return null;
    } catch (e) {
        console.warn("[AI] 歌曲匹配过程出错:", e);
        return null;
    }
}

/**
 * 获取歌词
 */
export async function fetchLyricById(id: string): Promise<string | null> {
    try {
        const res = await fetch(`/gdstudio-api/api.php?types=lyric&id=${id}`);
        const data = await res.json();
        return data.lyric || null;
    } catch (e) {
        return null;
    }
}

/**
 * 分析歌词情感
 */
export async function analyzeLyricEmotion(lyrics: string): Promise<LyricEmotion | null> {
    return await baseAnalyzeEmotion(lyrics);
}

/**
 * 校验 ASR 识别结果
 */
export async function validateAsrLyrics(asrData: any): Promise<boolean> {
    const textToAnalyze = Array.isArray(asrData)
        ? asrData.map((item: any) => item.transcript).join('\n')
        : JSON.stringify(asrData);
    return await baseValidateAsr(textToAnalyze);
}
