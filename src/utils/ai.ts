const API_URL = "/ai-api";

const SYSTEM_PROMPT = `[Strict Rule] 你是一个数据提取引擎，不是对话助手。
你禁止说任何人类语言，禁止解释，禁止寒暄。
你的唯一输出格式必须是 JSON：{"name": "歌名", "artist": "歌手"}。
1. 必须且只能返回 JSON 对象，格式为：{"name": "歌曲名", "artist": "歌手名"}。
2. 严谨性：只有确认为真实的音乐信息时才提取。
3. 关键：如果未找到任何信息，必须返回 {"name": null, "artist": null}。严禁只返回 null 这个单词。
4. 如果只找到了歌手名但没找到歌名，则返回 {"name": null, "artist": null}
5. 如果只找到了歌名但没找到歌手名，则返回 {"name": "歌曲名", "artist": null}
6. 如果你认为的歌名是比如泣けど喚けど朝がきて(Nakedo wamekedo asaga kite)带括号的，则只返回泣けど喚けど朝がきて即去掉你认为的歌曲名中的括号
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
export async function searchAndGetBestMatchId(name: string, artist: string | null, interactive: boolean = false): Promise<string | null> {
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
            console.log("[AI] 歌曲置信度匹配结果:", item.name, item.artist, sim);
            if (sim > maxSim) {
                maxSim = sim;
                bestId = item.id;
            }
        }

        // 置信度系统处理
        // 如果没有歌手信息且开启了交互模式，强制弹出选择框（防止匹配到同名不同歌手的歌）
        const forceManual = interactive && !artist;

        if (maxSim > 0.4 && !forceManual) {
            return bestId;
        } else if (interactive && results.length > 0) {
            // 置信度过低且开启了交互模式
            const optionsText = results.map((item, i) => {
                const artistName = Array.isArray(item.artist) ? item.artist.join('/') : item.artist;
                return `${i + 1}. ${item.name} - ${artistName}`;
            }).join('\n');

            const userChoice = window.prompt(
                `系统对歌曲 "${name}${artist ? ' - ' + artist : ''}" 的自动匹配置信度较低 (仅 ${Math.round(maxSim * 100)}%)。\n` +
                `请根据以下搜索结果手动选择正确的选项（输入序号）：\n\n${optionsText}\n\n输入其他内容或取消则跳过匹配。`
            );

            if (userChoice) {
                const index = parseInt(userChoice) - 1;
                if (results[index]) {
                    console.log(`[Manual Select] 用户选择了: ${results[index].name}`);
                    return results[index].id;
                }
            }
        }

        return null;
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
export interface EmotionScore {
    valence: number; // -1 to 1 (负向 -> 正向)
    arousal: number; // 0 to 1 (平静 -> 激动)
    tag: string;     // Passionate, Melancholy, Calm, Desperate
}

export interface LyricEmotion {
    global: EmotionScore;
    segments: { start: number; end: number; emotion: EmotionScore }[];
}

const EMOTION_PROMPT = `[Strict Rule] 你是一个精简的情感分析引擎。分析歌词并按【情感区间】返回坐标。
情感分类：Passionate (激情), Melancholy (失落), Calm (平静), Desperate (绝望)。
输出格式 (JSON)：
{
  "global": {"valence": 0.2, "arousal": 0.5, "tag": "Calm"},
  "segments": [
    {"start": 0, "end": 15, "emotion": {"valence": 0.1, "arousal": 0.2, "tag": "Calm"}},
    {"start": 16, "end": 30, "emotion": {"valence": 0.8, "arousal": 0.9, "tag": "Passionate"}}
  ]
}
规则：
1. 【核心目标】：根据歌词的语义（如主歌、副歌、高潮）划分区间。通常一首歌只需要 3-10 个区间。
2. 【严格边界】：最后一个 segment 的 end 必须【严格等于】输入的总行数减 1。禁止生成超出实际行数的区间。
3. 如果情感转折剧烈，即使只有一行也可以单独作为一个 segment。
4. Valence (正负情感): -1到1，Arousal (激动程度): 0到1。
5. 严禁解释，只返回 JSON。`;

/**
 * 分析歌词情感坐标 (Valence-Arousal 模型)
 */
export async function analyzeLyricEmotion(lyrics: string): Promise<LyricEmotion | null> {

    try {
        const lines = lyrics.split('\n');
        const totalLines = lines.length;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    { role: "system", content: EMOTION_PROMPT },
                    { role: "user", content: `歌词总行数: ${totalLines}\n歌词内容:\n${lyrics.slice(0, 3000)}` }
                ],
                temperature: 0.1
            }),
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            let aiResponse = data.choices[0].message.content.trim();

            if (aiResponse.toLowerCase() === 'null') {
                console.log("[AI Emotion] 判定为无效歌词，跳过情感分析");
                return null;
            }

            aiResponse = aiResponse.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log(JSON.parse(jsonMatch[0]));
                return JSON.parse(jsonMatch[0]) as LyricEmotion;
            }
        }
        return null;
    } catch (e) {
        console.warn("[AI Emotion] 分析失败:", e);
        const totalLines = lyrics.split('\n').length;
        return {
            global: { valence: 0, arousal: 0.2, tag: "Calm" },
            segments: [{ start: 0, end: totalLines - 1, emotion: { valence: 0, arousal: 0.2, tag: "Calm" } }]
        };
    }
}
const VALIDATE_ASR_PROMPT = `[Strict Rule] 你是一个极度严苛的歌词质量审计引擎。你收到的 JSON 是语音转文字 (ASR) 的原始识别结果。你的任务是剔除那些“听错了”的、无意义的、或者是由于噪音产生的乱码识别。
判断不合理的标准：
1. **语义破碎**：句子完全不通顺，单词之间没有任何逻辑关联（如：“哈玛尼女人格律师”、“阿莫西西比”等音译词堆砌）。
2. **乱码倾向**：文本看起来像是随机汉字的组合。
3. **噪音误识别**：包含大量重复的语气助词或无意义的短促识别。
判断合理的标准：
1. 句子语义基本通顺，具有中文或英文的表达习惯。
2. 看起来像是人类创作的歌词，具有一定的主题一致性。
只有在 70% 以上的句子都看起来像真实歌词时才返回 true。只要识别结果中充斥着“哈玛尼”、“阿莫”这类明显是识别噪音产生的音译乱码，必须返回 false。
返回值：只返回 true 或 false，严禁任何解释。`;

/**
 * 校验 ASR 识别结果是否为合理的歌词
 */
export async function validateAsrLyrics(asrData: any): Promise<boolean> {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    { role: "system", content: VALIDATE_ASR_PROMPT },
                    { role: "user", content: JSON.stringify(asrData) }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            const aiResponse = data.choices[0].message.content.trim().toLowerCase();
            return aiResponse.includes('true');
        }
        return false;
    } catch (e) {
        console.error("[AI] ASR 校验出错:", e);
        return true; // 出错时默认通过，避免误杀
    }
}
