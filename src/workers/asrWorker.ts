import { db } from '@/utils/db';
import { asrService } from '@/utils/asr/asr';
import { baseAnalyzeEmotion, baseValidateAsr } from '@/utils/ai-core';
import type { ASRResultRecord, UtteranceRecord } from '@/types/music';
import { mergeLyrics, parseNeteaseLrc } from '@/utils/asr/praseAsr';

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
        if (!record.lrcJson && !record.noLyrics) {
          self.postMessage({ type: 'STATUS', message: `检测到无歌词: ${record.name}` });
          console.log(`[ASR Worker] 检测到无歌词，开始静默处理: ${record.name}`);

          let asrPromise = asrService.transcribe(record.data);
          let lrcPromise: Promise<string | null> | null = null;

          if (record.uid.startsWith('netease')) {
            const neteaseId = record.uid.replace(/netease\D*(\d+)/, '$1');
            self.postMessage({ type: 'STATUS', message: `拉取校准歌词: ${record.name}` });
            console.log(`[ASR Worker] 正在拉取网易云官方歌词用于校准: ${neteaseId}`);
            lrcPromise = fetchLrcWithRetry(neteaseId, 3);
          } else if (record.neteaseId) {
            self.postMessage({ type: 'STATUS', message: `拉取校准歌词: ${record.name}` });
            console.log(`[ASR Worker] 使用关联的网易云 ID 获取官方歌词进行校准: ${record.neteaseId}`);
            lrcPromise = fetchLrcWithRetry(record.neteaseId, 3);
          }

          // 并行执行 ASR 和 歌词拉取
          const [asrResult, lrcResult] = await Promise.allSettled([
            asrPromise,
            lrcPromise || Promise.resolve(null)
          ]);

          // 处理 ASR 结果
          if (asrResult.status === 'fulfilled' && asrResult.value && (asrResult.value as ASRResultRecord).utterances) {
            let finalUtterances: UtteranceRecord[] = (asrResult.value as ASRResultRecord).utterances;

            // 1. AI 校验 ASR 结果逻辑合理性 (使用满血版内核)
            self.postMessage({ type: 'STATUS', message: `校验识别结果: ${record.name}` });
            const textToAnalyze = finalUtterances.map(u => u.transcript).join('\n');
            const isValidAsr = await baseValidateAsr(textToAnalyze);
            console.log(`[ASR Worker] ASR 逻辑校验结果: ${isValidAsr}`);

            // 保存原始 ASR 数据、审计状态以及网易云官方歌词(如有)
            const hasNeteaseLrc = lrcPromise && lrcResult.status === 'fulfilled' && !!lrcResult.value;
            const officialLrc = (lrcResult.status === 'fulfilled' && lrcResult.value) ? lrcResult.value : undefined;

            await db.music.update(record.id!, {
              asrJson: asrResult.value as ASRResultRecord,
              asrIsValid: isValidAsr,
              lineLrc: officialLrc || undefined
            });

            if (isValidAsr) {
              // --- 分支 1: ASR 结果有效 ---
              if (hasNeteaseLrc) {
                // 有官方歌词 -> 走对齐比对逻辑 (逐字切分)
                self.postMessage({ type: 'STATUS', message: `对齐官方歌词: ${record.name}` });
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
                self.postMessage({ type: 'STATUS', message: `使用官方歌词保底: ${record.name}` });
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
            self.postMessage({ type: 'STATUS', message: `AI 情感分析: ${record.name}` });
            console.log(`[ASR Worker] 正在进行语义情感分析...`);
            const emotionData = await baseAnalyzeEmotion(fullText);
            if (emotionData) {
              await db.music.update(record.id!, { emotionJson: emotionData });
              console.log(`[ASR Worker] 情感分析完成: ${record.name}`, emotionData);
            }
            // --- EmotionEngine 结束 ---

            self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
          } else if (asrResult.status === 'rejected') {
            console.error(`[ASR Worker] 歌曲识别失败，跳过: ${record.name}`, asrResult.reason);
          }
        } else if (!record.emotionJson && record.lrcJson) {
          // 增量处理：已有歌词但没有情感数据
          self.postMessage({ type: 'STATUS', message: `补全情感数据: ${record.name}` });
          console.log(`[ASR Worker] 补全情感数据: ${record.name}`);
          const fullText = (record.lrcJson as UtteranceRecord[]).map(u => u.transcript).join('\n');
          const emotionData = await baseAnalyzeEmotion(fullText);
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
