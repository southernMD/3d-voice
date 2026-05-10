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

self.onmessage = async (e: MessageEvent) => {
  if (e.data === 'START') {
    try {
      const records = await db.music.toArray();

      for (const record of records) {
        if (!record.lrcJson) {
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
          if (asrResult.status === 'fulfilled' && asrResult.value && asrResult.value.utterances) {
            let finalUtterances = asrResult.value.utterances;

            // 增强处理：如果拉取到了歌词，进行融合
            if (lrcPromise && lrcResult.status === 'fulfilled' && lrcResult.value) {
              const parsedLrc = parseNeteaseLrc(lrcResult.value);
              finalUtterances = mergeLyrics(finalUtterances, parsedLrc);
              console.log(`[ASR Worker] 网易云歌词校准完成`);
            } else if (lrcPromise && lrcResult.status === 'rejected') {
              console.error('[ASR Worker] 网易云歌词拉取最终失败', lrcResult.reason);
            }

            await db.music.update(record.id!, { lrcJson: finalUtterances });
            console.log(`[ASR Worker] 歌曲处理成功，已入库: ${record.name},最终入库歌词：`, finalUtterances);
            self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
          } else if (asrResult.status === 'rejected') {
            console.error(`[ASR Worker] 歌曲识别失败，跳过: ${record.name}`, asrResult.reason);
          }
        } else {
          console.log(`[ASR Worker] 已有歌词`, record.lrcJson);
        }
      }
      console.log('[ASR Worker] 扫描并静默识别全部完成。');
    } catch (err) {
      console.error('[ASR Worker] 扫描数据库失败:', err);
    }
  }
};
