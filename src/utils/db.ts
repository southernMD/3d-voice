import Dexie, { type EntityTable } from 'dexie';

/**
 * 音乐数据接口
 */
export interface MusicRecord {
  id?: number;
  uid: string; // 唯一标识符
  name: string;
  data: Blob;  // 存储 Blob 二进制数据
  lrcJson?: any; // 存储解析后的歌词 JSON 数据
  neteaseId?: string; // 关联的网易云歌曲 ID
}

/**
 * 播放列表数据库
 */
const db = new Dexie('MusicDatabase') as Dexie & {
  music: EntityTable<MusicRecord, 'id'>;
};

// 定义 Schema
// 如果只添加非索引字段 (lrcJson)，可以不升级 version
db.version(2).stores({
  music: '++id, uid, name, lrcJson'
});

export { db };