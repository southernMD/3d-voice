import { db } from '@/utils/db';
import { asrService } from '@/utils/asr';

self.onmessage = async (e: MessageEvent) => {
  if (e.data === 'START') {
    try {
      // 获取数据库中所有的音乐记录
      const records = await db.music.toArray();

      // 并发数为 1：使用 for...of 顺序执行
      for (const record of records) {
        // 如果 lrcJson 是空的，则进行静默请求
        if (!record.lrcJson) {
          console.log(`[ASR Worker] 检测到无歌词，开始静默识别: ${record.name}`);
          try {
            const result = await asrService.transcribe(record.data);
            if (result && result.utterances) {
              // 把返回结果的 utterances 作为值添加
              await db.music.update(record.id!, { lrcJson: result.utterances });
              console.log(result.utterances);
              console.log(`[ASR Worker] 歌曲识别成功，已入库: ${record.name}`);
              self.postMessage({ type: 'UPDATE_SUCCESS', id: record.id });
            }
          } catch (err) {
            console.error(`[ASR Worker] 歌曲识别失败，跳过: ${record.name}`, err);
            // 报错直接跳过，继续下一首
          }
        }
      }
      console.log('[ASR Worker] 扫描并静默识别全部完成。');
    } catch (err) {
      console.error('[ASR Worker] 扫描数据库失败:', err);
    }
  }
};
