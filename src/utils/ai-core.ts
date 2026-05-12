/**
 * AI 核心逻辑层 (纯逻辑，使用最完整的提示词版本)
 */

const API_URL = "/ai-api";

// --- 类型定义 ---
export interface MusicInfo {
    name: string | null;
    artist: string | null;
}

export interface EmotionScore {
    valence: number;
    arousal: number;
    tag: string;
}

export interface LyricEmotion {
    global: EmotionScore;
    segments: { start: number; end: number; emotion: EmotionScore }[];
}

// --- 完整提示词 (禁止删减) ---

export const SYSTEM_PROMPT = `[Strict Rule] 你是一个数据提取引擎，不是对话助手。
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

export const EMOTION_PROMPT = `[Strict Rule] 你是一个精简的情感分析引擎。分析歌词并按【情感区间】返回坐标。
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

export const VALIDATE_ASR_PROMPT = `[Strict Rule] 你是一个极度严苛的歌词质量审计引擎。你收到的 JSON 是语音转文字 (ASR) 的原始识别结果。
任务：判断这些文字是否为【有效的中文或英文歌词】。
由于识别器不支持日语，它常会将日语歌词识别成极其离谱的中文音译（空耳），例如：
- "哈斯卡西" (应为日语 恥ずかしい)
- "欧萌哒" (应为日语 おめでとう)
- "阿里嘎多" (应为日语 ありがとう)
- "弹球表面的多耶" (完全无意义的汉字堆砌)

判定为 false (无效) 的标准：
1. **跨语言空耳**：看起来像是汉字堆砌，虽然每个字都认识，但组合在一起完全没有中文语义，明显是强行匹配日语发音的结果。
2. **语义破碎**：句子完全不通顺，单词之间没有任何逻辑关联。
3. **乱码倾向**：文本看起来像是随机汉字的组合，缺乏诗意或歌词感。

判定为 true (有效) 的标准：
1. 具有正常的中文或英文表达习惯，语义通顺。
2. 看起来像是人类创作的文字。

只要识别结果中存在显著的“日语转中文空耳”特征，必须返回 false。
返回值：只返回 true 或 false，严禁任何解释。`;

// --- 基础请求 ---
async function fetchAI(systemPrompt: string, userContent: string) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "glm-4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
            ],
            temperature: 0.1
        })
    });
    return await response.json();
}

// --- 核心业务函数 ---

export async function baseExtractMusicInfo(text: string): Promise<MusicInfo> {
    try {
        const data = await fetchAI(SYSTEM_PROMPT, text);
        if (data.choices?.[0]?.message?.content) {
            let aiResponse = data.choices[0].message.content.trim();
            aiResponse = aiResponse.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return { name: parsed.name || null, artist: parsed.artist || null };
            }
        }
    } catch (e) {
        console.error("[AI Core] 提取音乐信息失败:", e);
    }
    return { name: null, artist: null };
}

export async function baseAnalyzeEmotion(lyrics: string): Promise<LyricEmotion | null> {
    try {
        const lines = lyrics.split('\n');
        const userMsg = `歌词总行数: ${lines.length}\n歌词内容:\n${lyrics.slice(0, 3000)}`;
        const data = await fetchAI(EMOTION_PROMPT, userMsg);
        
        if (data.choices?.[0]?.message?.content) {
            let aiResponse = data.choices[0].message.content.trim();
            if (aiResponse.toLowerCase() === 'null') return null;
            aiResponse = aiResponse.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as LyricEmotion;
            }
        }
    } catch (e) {
        console.error("[AI Core] 情感分析失败:", e);
    }
    return null;
}

export async function baseValidateAsr(text: string): Promise<boolean> {
    try {
        const data = await fetchAI(VALIDATE_ASR_PROMPT, `请审计以下 ASR 识别文本，只返回 true 或 false：\n\n${text}`);
        const result = data.choices?.[0]?.message?.content?.trim().toLowerCase();
        return result === 'true';
    } catch (e) {
        console.error("[AI Core] ASR 审计失败:", e);
        return false;
    }
}
