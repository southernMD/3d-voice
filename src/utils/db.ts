import Dexie, { type EntityTable } from 'dexie';

/**
 * 音乐数据接口
 */
export interface MusicRecord {
  id?: number;
  uid: string; // 唯一标识符
  name: string;
  data: Blob;  // 存储 Blob 二进制数据
}

/**
 * 播放列表数据库
 */
const db = new Dexie('MusicDatabase') as Dexie & {
  music: EntityTable<MusicRecord, 'id'>;
};

// 定义 Schema
db.version(1).stores({
  music: '++id, uid, name'
});

export { db };
