const API_URL = "/ai-api";

const SYSTEM_PROMPT = `[Strict Rule] 你是一个数据提取引擎，不是对话助手。
你禁止说任何人类语言，禁止解释，禁止寒暄。
你的唯一输出格式必须是 JSON：{"name": "歌名", "artist": "歌手"}。
1. 必须且只能返回 JSON 对象，格式为：{"name": "歌曲名", "artist": "歌手名"}。
2. 严谨性：只有确认为真实的音乐信息时才提取。
3. 关键：如果未找到任何信息，必须返回 {"name": null, "artist": null}。严禁只返回 null 这个单词。
4. 如果只找到了歌手名但没找到歌名，则返回 {"name": null, "artist": null}
5. 如果只找到了歌名但没找到歌手名，则返回 {"name": "歌曲名", "artist": null}
7. 示例：
   - "听周杰伦的晴天" -> {"name": "晴天", "artist": "周杰伦"}
   - "你好" -> {"name": null, "artist": null}
   - "啊吧吧吧" -> {"name": null, "artist": null}
   - "只找陈奕迅" -> {"name": null, "artist": null}
   - "" -> {"name": null, "artist": null}
   - "权御天下真的好听" -> {"name": "权御天下", "artist": null}`;

export interface MusicInfo {
    name: string | null;
    artist: string | null;
}

/**
 * 使用 AI 提取文本中的歌曲名和歌手
 */
export async function extractMusicInfo(text: string): Promise<MusicInfo> {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: text }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            let aiResponse = data.choices[0].message.content.trim();

            // 移除可能存在的 Markdown 代码块包裹
            aiResponse = aiResponse.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            console.log(`[AI Raw Response] ${aiResponse}`);

            // 正则匹配第一个 JSON 对象 (非贪婪匹配)
            const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                try {
                    const finalJson = jsonMatch[0];
                    console.log(`[AI 提取结果] ${finalJson}`);
                    const parsed = JSON.parse(finalJson);
                    
                    // 确保返回标准格式
                    return {
                        name: parsed.name || null,
                        artist: parsed.artist || null
                    };
                } catch (e) {
                    console.error("[AI] JSON 解析失败:", e);
                }
            }
        }
        return { name: null, artist: null };
    } catch (error) {
        console.error("[AI] 提取音乐信息出错:", error);
        return { name: null, artist: null };
    }
}

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
 * 搜索歌曲并根据 AI 提取的信息找到最匹配的歌曲 ID
 */
export async function searchAndGetBestMatchId(name: string, artist: string | null): Promise<string | null> {
    try {
        const res = await fetch(`/gdstudio-api/api.php?types=search&name=${encodeURIComponent(name)}&count=5`);
        const results = await res.json();

        if (!Array.isArray(results) || results.length === 0) return null;

        let bestId: string | null = null;
        let maxSim = -1;

        for (const item of results) {
            // 基础歌名相似度
            let sim = getSimilarity(name, item.name);

            // 歌手相似度权重
            if (artist && item.artist) {
                const artists = Array.isArray(item.artist) ? item.artist : [item.artist];
                let artistSim = 0;
                for (const a of artists) {
                    artistSim = Math.max(artistSim, getSimilarity(artist, String(a)));
                }
                // 综合评分 (歌名 60%，歌手 40%)
                sim = sim * 0.6 + artistSim * 0.4;
            }

            if (sim > maxSim) {
                maxSim = sim;
                bestId = item.id;
            }
        }

        // 只有相似度达到一定程度才认为匹配成功
        return maxSim > 0.4 ? bestId : null;
    } catch (e) {
        console.warn("[AI] 歌曲匹配过程出错:", e);
        return null;
    }
}

/**
 * 获取歌曲歌词
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
