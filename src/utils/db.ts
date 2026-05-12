import Dexie, { type EntityTable } from 'dexie';
import type {
  UtteranceRecord,
  ASRResultRecord,
  LyricEmotion
} from '@/types/music';

/**
 * 音乐数据库存储记录接口
 */
export interface MusicRecord {
  id?: number;
  uid: string; // 唯一标识符
  name: string;
  data: Blob;  // 存储 Blob 二进制数据
  lrcJson?: UtteranceRecord[]; // 存储解析/对齐后的最终歌词 JSON
  asrJson?: ASRResultRecord;   // 存储必剪 ASR 原始识别 JSON
  asrIsValid?: boolean;        // AI 审计是否通过 (防止空耳乱码)
  lineLrc?: string;            // 存储从网易云获取的原始歌词文本 (LRC)
  neteaseId?: string;          // 关联的网易云歌曲 ID
  emotionJson?: LyricEmotion;  // 存储语义情感分析数据
  noLyrics?: boolean;          // 标记该歌曲是否确认为无歌词
}

/**
 * 播放列表数据库
 */
const db = new Dexie('MusicDatabase') as Dexie & {
  music: EntityTable<MusicRecord, 'id'>;
};

// 定义 Schema
// 注意：不要在索引字符串里列出所有字段，只需要列出需要用 .where() 查询的字段
db.version(4).stores({
  music: '++id, uid, name, neteaseId' // 只保留主键和常用查询字段
});

export { db };