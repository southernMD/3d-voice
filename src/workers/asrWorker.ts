import { db } from '@/utils/db';
import { asrService } from '@/utils/asr';

interface Word {
  label: string;
  start_time: number;
  end_time: number;
}

interface Utterance {
  start_time: number;
  end_time: number;
  transcript: string;
  words: Word[];
}

interface NeteaseLrcLine {
  start_time: number;
  end_time: number;
  text: string;
}

interface EmotionScore {
  valence: number;
  arousal: number;
  tag: string;
}

interface LyricEmotion {
  global: EmotionScore;
  segments: { start: number; end: number; emotion: EmotionScore }[];
}

interface ASRResult {
  utterances: Utterance[];
}

// 解析网易云 LRC 歌词
function parseNeteaseLrc(lrcStr: string): NeteaseLrcLine[] {
  const lines = lrcStr.split('\n');
  const result: NeteaseLrcLine[] = [];
  // 匹配更广泛的 LRC 时间格式: [00:00.00], [0:00.00], [00:00]
  const regex = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseFloat(match[2]);
      const timeMs = Math.round((min * 60 + sec) * 1000);
      const text = match[3].trim();
      if (text) {
        result.push({ start_time: timeMs, end_time: 0, text });
      }
    }
  }

  // 封装 end_time
  for (let i = 0; i < result.length; i++) {
    result[i].end_time = i < result.length - 1 ? result[i + 1].start_time : result[i].start_time + 5000;
  }

  return result;
}

// 智能分词：中文字符按字切分，英文字符按单词切分
function tokenize(text: string): string[] {
  // 匹配：中文字符 | 英文单词(含撇号)及其后的空格标点 | 其他非空白连续字符
  const regex = /[\u4e00-\u9fa5]|[a-zA-Z0-9']+(?:[^a-zA-Z0-9\u4e00-\u9fa5]+)?|[^\s\u4e00-\u9fa5a-zA-Z0-9']+/g;
  return text.match(regex) || [];
}

// 用 A歌词(官方LRC) 作为基准，将 B歌词(ASR结果) 映射融合进去
function mergeLyrics(bLines: Utterance[], aLines: NeteaseLrcLine[]): Utterance[] {
  if (!aLines || aLines.length === 0) return bLines;

  // 1. 提取所有 B 端的逐字数据到一个大池子里
  const allBWords: Word[] = [];
  for (const b of bLines) {
    if (b.words && b.words.length > 0) {
      allBWords.push(...b.words);
    }
  }

  // 2. 将每个 B 端的字分配给与其重叠度最高的 A 端句子
  const aToWords = new Map<number, Word[]>();

  for (const w of allBWords) {
    let bestAIndex = -1;
    let maxOverlap = 0;

    for (let j = 0; j < aLines.length; j++) {
      const a = aLines[j];
      // 计算这个字与 A 句子的重叠时长
      const overlap = Math.max(0, Math.min(w.end_time, a.end_time) - Math.max(w.start_time, a.start_time));
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestAIndex = j;
      }
    }

    // 如果这个字和某个 A 句子有交集，就归给它
    if (bestAIndex !== -1 && maxOverlap > 0) {
      if (!aToWords.has(bestAIndex)) {
        aToWords.set(bestAIndex, []);
      }
      aToWords.get(bestAIndex)!.push(w);
    }
  }

  // 3. 遍历官方 A 歌词，填充文字并输出
  const finalLines: Utterance[] = [];

  for (let j = 0; j < aLines.length; j++) {
    const a = aLines[j];
    const AText = a.text;
    const tokens = tokenize(AText);
    const associatedWords = aToWords.get(j) || [];

    if (associatedWords.length > 0 && tokens.length > 0) {
      // 按照时间从小到大排序（确保歌词顺序正确）
      associatedWords.sort((x, y) => x.start_time - y.start_time);

      const newWords: Word[] = [];

      if (tokens.length <= associatedWords.length) {
        // 情况 1: A端 Token 数小于等于 B端词位
        // 1对1分配，最后一个 Token 吞掉 B端剩余的所有时间片
        for (let i = 0; i < tokens.length; i++) {
          const w = associatedWords[i];
          if (i === tokens.length - 1) {
            const lastW = associatedWords[associatedWords.length - 1];
            newWords.push({ ...w, label: tokens[i], end_time: Math.max(w.end_time, lastW.end_time) });
          } else {
            newWords.push({ ...w, label: tokens[i] });
          }
        }
      } else {
        // 情况 2: A端 Token 数多于 B端词位
        // 1对1分配，最后一个词位吞掉 A端剩余的所有 Token
        for (let i = 0; i < associatedWords.length; i++) {
          const w = associatedWords[i];
          if (i === associatedWords.length - 1) {
            newWords.push({ ...w, label: tokens.slice(i).join('') });
          } else {
            newWords.push({ ...w, label: tokens[i] });
          }
        }
      }

      finalLines.push({
        transcript: AText,
        start_time: Math.min(a.start_time, associatedWords[0].start_time),
        end_time: Math.max(a.end_time, associatedWords[associatedWords.length - 1].end_time),
        words: newWords
      });
    } else {
      // 没找到任何对应的 ASR 词位，直接使用 A 歌词原文保底显示
      finalLines.push({
        transcript: AText,
        start_time: a.start_time,
        end_time: a.end_time,
        words: [{ label: AText, start_time: a.start_time, end_time: a.end_time }]
      });
    }
  }

  return finalLines;
}



const VALIDATE_ASR_PROMPT = `[Strict Rule] 你是一个极度严苛的歌词质量审计引擎。分析 ASR (语音转文字) 识别结果。你的任务是剔除由于噪音产生的乱码识别。
判断不合理的标准：
1. **语义破碎**：句子不通顺，单词无逻辑关联（如：“哈玛尼女人格律师”、“阿莫西西比”等）。
2. **乱码倾向**：文本看起来像是随机汉字或幻听。
判断合理的标准：
1. 句子语义基本通顺，具有人类语言逻辑。
2. 看起来像是真实歌词。
只要识别结果中充斥着明显是识别噪音产生的音译乱码，必须返回 false。
返回值：只返回 true 或 false，严禁解释。`;

async function validateAsrLyrics(asrData: any): Promise<boolean> {
  try {
    const response = await fetch('/ai-api', {
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
    const content = data.choices[0].message.content.trim().toLowerCase();
    return content.includes('true');
  } catch (e) {
    return true;
  }
}

// 获取网易云歌词并支持重试
async function fetchLrcWithRetry(id: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`/gdstudio-api/api.php?types=lyric&id=${id}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data && data.lyric) {
        return data.lyric;
      }
      return null; // 如果成功拿到数据但没有lyric字段，则直接返回null不再重试
    } catch (e) {
      console.warn(`[ASR Worker] 获取网易云歌词失败，剩余重试次数: ${retries - 1 - i}`, e);
      if (i === retries - 1) throw e;
      // 重试前稍作等待
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

const EMOTION_PROMPT = `[Strict Rule] 你是一个精简的情感分析引擎。分析歌词并按【情感区间】返回坐标。
情感分类：Passionate (激情), Melancholy (失落), Calm (平静), Desperate (绝望)。
输出格式 (JSON)：
{
  "global": {"valence": 0.2, "arousal": 0.5, "tag": "Calm"},
  "segments": [
    {"start": 0, "end": 8, "emotion": {"valence": 0.1, "arousal": 0.2, "tag": "Calm"}},
    {"start": 9, "end": 20, "emotion": {"valence": -0.5, "arousal": 0.8, "tag": "Desperate"}}
  ]
}
规则：
1. 【核心目标】：根据歌词的语义（如主歌、副歌、高潮）划分区间。通常一首歌只需要 3-10 个区间。
2. 【严格边界】：最后一个 segment 的 end 必须【严格等于】输入的总行数减 1。禁止生成超出实际行数的区间。
3. 如果情感转折剧烈，即使只有一行也可以单独作为一个 segment。
4. Valence (正负情感): -1到1，Arousal (激动程度): 0到1。
5. 严禁解释，只返回 JSON。`;

async function analyzeLyricEmotion(lyrics: string): Promise<LyricEmotion | null> {
  try {
    const lines = lyrics.split('\n');
    const totalLines = lines.length;

    const response = await fetch('/ai-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          { role: "system", content: EMOTION_PROMPT },
          { role: "user", content: `歌词总行数: ${totalLines}\n歌词内容:\n${lyrics.slice(0, 3000)}` }
        ],
        temperature: 0.1
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
      const aiResponse = data.choices[0].message.content.trim();
      if (aiResponse.toLowerCase() === 'null') return null;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LyricEmotion;
      }
    }
    return null;
  } catch (e) {
    console.warn("[ASR Worker Emotion] 分析失败:", e);
    const totalLines = lyrics.split('\n').length;
    return {
      global: { valence: 0, arousal: 0.2, tag: "Calm" },
      segments: [{ start: 0, end: totalLines - 1, emotion: { valence: 0, arousal: 0.2, tag: "Calm" } }]
    };
  }
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data === 'START') {
    try {
      const records = await db.music.toArray();

      for (const record of records) {
        if (!record.lrcJson && !record.noLyrics) {
          console.log(`[ASR Worker] 检测到无歌词，开始静默处理: ${record.name}`);

          let asrPromise = asrService.transcribe(record.data);
          let lrcPromise: Promise<string | null> | null = null;

          if (record.uid.startsWith('netease')) {
            const neteaseId = record.uid.replace(/netease\D*(\d+)/, '$1');
            console.log(`[ASR Worker] 正在拉取网易云官方歌词用于校准: ${neteaseId}`);
            lrcPromise = fetchLrcWithRetry(neteaseId, 3);
          } else if (record.neteaseId) {
            console.log(`[ASR Worker] 使用关联的网易云 ID 获取官方歌词进行校准: ${record.neteaseId}`);
            lrcPromise = fetchLrcWithRetry(record.neteaseId, 3);
          }

          // 并行执行 ASR 和 歌词拉取
          const [asrResult, lrcResult] = await Promise.allSettled([
            asrPromise,
            lrcPromise || Promise.resolve(null)
          ]);

          // 处理 ASR 结果
          if (asrResult.status === 'fulfilled' && asrResult.value && (asrResult.value as ASRResult).utterances) {
            let finalUtterances: Utterance[] = (asrResult.value as ASRResult).utterances;

            // 1. AI 校验 ASR 结果逻辑合理性
            const isValidAsr = await validateAsrLyrics(asrResult.value);
            console.log(`[ASR Worker] ASR 逻辑校验结果: ${isValidAsr}`);

            const hasNeteaseLrc = lrcPromise && lrcResult.status === 'fulfilled' && lrcResult.value;

            if (isValidAsr) {
              // --- 分支 1: ASR 结果有效 ---
              if (hasNeteaseLrc) {
                // 有官方歌词 -> 走对齐比对逻辑 (逐字切分)
                const parsedLrc = parseNeteaseLrc(lrcResult.value!);
                finalUtterances = mergeLyrics(finalUtterances, parsedLrc);
                console.log(`[ASR Worker] ASR 有效 & 官方歌词存在 -> 完成逐字对齐融合: ${record.name}`);
              } else {
                // 无官方歌词 -> 直接使用 ASR 结果 (包含切分)
                console.log(`[ASR Worker] ASR 有效 & 无官方歌词 -> 使用原始 ASR 结果: ${record.name}`);
              }
            } else {
              // --- 分支 2: ASR 结果无效 (乱码/噪音) ---
              if (hasNeteaseLrc) {
                // 有官方歌词 -> 放弃 ASR 映射，回退到纯文本模式 (无逐字切分)
                const parsedLrc = parseNeteaseLrc(lrcResult.value!);
                finalUtterances = parsedLrc.map(line => ({
                  transcript: line.text,
                  start_time: line.start_time,
                  end_time: line.end_time,
                  words: [{ label: line.text, start_time: line.start_time, end_time: line.end_time }]
                }));
                console.log(`[ASR Worker] ASR 乱码 & 官方歌词存在 -> 使用网易云文本保底 (无切分): ${record.name}`);
              } else {
                // 无官方歌词 -> 彻底标记为无歌词
                console.warn(`[ASR Worker] ASR 乱码 & 无官方歌词 -> 标记为无歌词: ${record.name}`);
                await db.music.update(record.id!, { noLyrics: true, lrcJson: [] });
                self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
                continue;
              }
            }

            // 保存最终结果并重置标记
            await db.music.update(record.id!, { lrcJson: finalUtterances, noLyrics: false });
            console.log(`[ASR Worker] 歌词数据处理完成并入库: ${record.name}`);

            // --- EmotionEngine 开始 ---
            const fullText = finalUtterances.map(u => u.transcript).join('\n');
            console.log(`[ASR Worker] 正在进行语义情感分析...`);
            const emotionData = await analyzeLyricEmotion(fullText);
            if (emotionData) {
              await db.music.update(record.id!, { emotionJson: emotionData });
              console.log(`[ASR Worker] 情感分析完成: ${record.name}`, emotionData);
            }
            // --- EmotionEngine 结束 ---

            self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
          } else if (asrResult.status === 'rejected') {
            console.error(`[ASR Worker] 歌曲识别失败，跳过: ${record.name}`, asrResult.reason);
          }
        } else if (!record.emotionJson) {
          // 增量处理：已有歌词但没有情感数据
          console.log(`[ASR Worker] 补全情感数据: ${record.name}`);
          const fullText = (record.lrcJson as Utterance[]).map(u => u.transcript).join('\n');
          const emotionData = await analyzeLyricEmotion(fullText);
          if (emotionData) {
            await db.music.update(record.id!, { emotionJson: emotionData });
            console.log(`[ASR Worker] 情感补全完成: ${record.name}`);
            self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
          }
        }
      }
      console.log('[ASR Worker] 扫描并静默处理完成。');
    } catch (err) {
      console.error('[ASR Worker] 扫描数据库失败:', err);
    }
  }
};
