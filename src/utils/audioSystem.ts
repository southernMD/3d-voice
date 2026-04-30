import { ref } from 'vue';
import { db } from './db';
import { getVideoMsg, getVideoDowloadLink } from './bilibili';

/**
 * 音乐轨道接口
 */
export interface Track {
  id: string;
  name: string;
  blob: Blob; // 改为存储 Blob
  url: string;
}

export const PlayMode = {
  ListLoop: 'listLoop',
  SingleLoop: 'singleLoop',
  Random: 'random'
} as const;

export type PlayMode = typeof PlayMode[keyof typeof PlayMode];

/**
 * 音频系统类：负责音频上下文管理、分析器设置及播放列表逻辑
 */
export class AudioSystem {
  public audioContext: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  public audioTag: HTMLAudioElement | null = null;
  public dataArray: Uint8Array | null = null;

  public isPlaying = ref(false);
  public fileName = ref('');
  public playlist = ref<Track[]>([]);
  public currentIndex = ref(-1);
  public playMode = ref<PlayMode>(PlayMode.ListLoop);

  // 进度与音量相关
  public currentTime = ref(0);
  public duration = ref(0);
  public volume = ref(0.7);

  /**
   * 初始化：从数据库加载缓存的音乐
   */
  public async init() {
    try {
      const records = await db.music.toArray();
      if (records && records.length > 0) {
        const cachedTracks: Track[] = records.map(r => ({
          id: r.uid,
          name: r.name,
          blob: r.data,
          url: URL.createObjectURL(r.data)
        }));
        this.playlist.value.push(...cachedTracks);
      }
    } catch (err) {
      console.error('加载缓存音乐失败:', err);
    }
  }

  /**
   * 初始化音频上下文
   */
  private ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
    }
  }

  /**
   * 验证文件是否为有效的音频文件
   */
  private async validateAudio(blob: Blob): Promise<boolean> {
    const tempContext = new AudioContext();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
      return audioBuffer !== null;
    } catch {
      return false;
    } finally {
      await tempContext.close();
    }
  }

  /**
   * 添加歌曲到列表（带格式校验，并将 File 转为 Blob 存入 Dexie）
   */
  public async addTracksWithValidation(files: File[]) {
    const validTracks: Track[] = [];
    const invalidFiles: string[] = [];

    for (const file of files) {
      // File 本身就是 Blob，我们可以直接用它验证
      const isValid = await this.validateAudio(file);
      if (isValid) {
        const uid = Math.random().toString(36).substring(2, 9);

        // 显式转换为 Blob 存储，丢弃 File 特有的 metadata（如 lastModified）
        const pureBlob = new Blob([file], { type: file.type });

        validTracks.push({
          id: uid,
          name: file.name,
          blob: pureBlob,
          url: URL.createObjectURL(pureBlob)
        });

        // 存入数据库
        await db.music.add({
          uid: uid,
          name: file.name,
          data: pureBlob
        });
      } else {
        invalidFiles.push(file.name);
      }
    }

    if (invalidFiles.length > 0) {
      alert(`以下文件无法解析为音频，已被忽略：\n${invalidFiles.join('\n')}`);
    }

    if (validTracks.length > 0) {
      this.playlist.value.push(...validTracks);
      if (this.currentIndex.value === -1) {
        this.playTrack(this.playlist.value.length - validTracks.length);
      }
    }
  }

  /**
   * 通过 B 站链接添加歌曲
   */
  public async addBiliTrack(url: string, sessData?: string) {
    // 1. 获取视频信息 (直接传入原始链接，让 getVideoMsg 处理短链解析)
    const info = await getVideoMsg(url, sessData);
    if (!info) throw new Error('无法获取视频信息');

    const title = info.title;
    const cid = info.cid;
    const bvid = info.bvid; // 从返回的信息中直接获取真实的 BVID

    // 2. 获取播放链接数据
    const downloadData = await getVideoDowloadLink(cid, bvid, sessData);
    const audioUrl = downloadData.audio.base_url || downloadData.audio.baseUrl;
    if (!audioUrl) throw new Error('未找到有效的音频轨道');

    // 3. 下载音频 Blob (核心重现：对应 info/dowloadBiliBili.ts 的 downloadFile 逻辑)
    // 浏览器环境必须通过代理设置 Referer
    const isProd = import.meta.env.PROD;
    const referer = `https://www.bilibili.com/video/${bvid}`; // 对应脚本中的 webUrl
    const fetchUrl = isProd
      ? `/api/download?url=${encodeURIComponent(audioUrl)}&referer=${encodeURIComponent(referer)}`
      : `/bili-download?url=${encodeURIComponent(audioUrl)}&referer=${encodeURIComponent(referer)}`;

    const response = await fetch(fetchUrl, {
      headers: sessData ? { 'X-Bili-Sessdata': sessData } : {}
    });

    if (!response.ok) throw new Error('下载音频流失败，Referer 校验未通过');
    const blob = await response.blob();

    // 4. 存入数据库和列表
    const id = `bili-${Date.now()}`;
    await db.music.add({
      uid: id,
      name: title,
      data: blob,
    });

    const track: Track = {
      id,
      name: title,
      blob,
      url: URL.createObjectURL(blob)
    };

    this.playlist.value.push(track);
    return track;
  }

  /**
   * 播放指定索引的歌曲
   */
  public playTrack(index: number) {
    if (index < 0 || index >= this.playlist.value.length) return;

    this.ensureContext();
    this.stopCurrent();

    const track = this.playlist.value[index];
    this.currentIndex.value = index;
    this.fileName.value = track.name;

    this.audioTag = new Audio();
    this.audioTag.src = track.url;
    this.audioTag.crossOrigin = "anonymous";
    this.audioTag.volume = this.volume.value;

    // 连接节点
    const sourceNode = this.audioContext!.createMediaElementSource(this.audioTag);
    sourceNode.connect(this.analyser!);
    this.analyser!.connect(this.audioContext!.destination);

    if (this.audioContext!.state === 'suspended') {
      this.audioContext!.resume();
    }

    this.audioTag.ontimeupdate = () => {
      if (this.audioTag) this.currentTime.value = this.audioTag.currentTime;
    };
    this.audioTag.onloadedmetadata = () => {
      if (this.audioTag) this.duration.value = this.audioTag.duration;
    };

    this.audioTag.play().catch(err => {
      console.error('播放失败:', err);
      this.isPlaying.value = false;
    });

    this.isPlaying.value = true;

    this.audioTag.onended = () => {
      if (this.playMode.value === PlayMode.SingleLoop) {
        this.playTrack(this.currentIndex.value);
      } else {
        this.next();
      }
    };
  }

  /**
   * 从列表和数据库中移除歌曲
   */
  public async removeTrack(index: number) {
    const track = this.playlist.value[index];
    if (!track) return;

    await db.music.where('uid').equals(track.id).delete();
    URL.revokeObjectURL(track.url);

    if (this.currentIndex.value === index) {
      this.stopCurrent();
      this.currentIndex.value = -1;
    } else if (this.currentIndex.value > index) {
      this.currentIndex.value--;
    }

    this.playlist.value.splice(index, 1);
  }

  /**
   * 重命名歌曲
   */
  public async renameTrack(id: string, newName: string) {
    const track = this.playlist.value.find(t => t.id === id);
    if (!track) return;

    // 更新内存
    track.name = newName;
    if (this.currentIndex.value !== -1 && this.playlist.value[this.currentIndex.value].id === id) {
      this.fileName.value = newName;
    }

    // 更新数据库
    await db.music.where('uid').equals(id).modify({ name: newName });
  }

  /**
   * 清空所有
   */
  public async clearAll() {
    this.stopCurrent();
    await db.music.clear();
    this.playlist.value.forEach(t => URL.revokeObjectURL(t.url));
    this.playlist.value = [];
    this.currentIndex.value = -1;
  }

  public setVolume(val: number) {
    this.volume.value = val;
    if (this.audioTag) {
      this.audioTag.volume = val;
    }
  }

  public seek(time: number) {
    if (this.audioTag) {
      this.audioTag.currentTime = time;
    }
  }

  public togglePlay() {
    if (!this.audioTag) return;

    if (this.isPlaying.value) {
      this.audioTag.pause();
    } else {
      this.audioContext?.resume();
      this.audioTag.play().catch(() => { });
    }
    this.isPlaying.value = !this.isPlaying.value;
  }

  public next() {
    if (this.playlist.value.length === 0) return;

    let nextIndex: number;
    if (this.playMode.value === PlayMode.Random) {
      nextIndex = Math.floor(Math.random() * this.playlist.value.length);
      // 如果随机到了当前这一首且列表不止一首，再随机一次
      if (nextIndex === this.currentIndex.value && this.playlist.value.length > 1) {
        nextIndex = (nextIndex + 1) % this.playlist.value.length;
      }
    } else {
      nextIndex = (this.currentIndex.value + 1) % this.playlist.value.length;
    }
    this.playTrack(nextIndex);
  }

  public prev() {
    if (this.playlist.value.length === 0) return;

    let prevIndex: number;
    if (this.playMode.value === PlayMode.Random) {
      prevIndex = Math.floor(Math.random() * this.playlist.value.length);
      if (prevIndex === this.currentIndex.value && this.playlist.value.length > 1) {
        prevIndex = (prevIndex + 1) % this.playlist.value.length;
      }
    } else {
      prevIndex = (this.currentIndex.value - 1 + this.playlist.value.length) % this.playlist.value.length;
    }
    this.playTrack(prevIndex);
  }

  private stopCurrent() {
    if (this.audioTag) {
      this.audioTag.pause();
      this.audioTag.src = '';
      this.audioTag = null;
    }
    this.isPlaying.value = false;
    this.currentTime.value = 0;
    this.duration.value = 0;
  }

  public getFrequencyData(): Uint8Array | null {
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);
      return this.dataArray;
    }
    return null;
  }

  public dispose() {
    this.stopCurrent();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.playlist.value.forEach(t => URL.revokeObjectURL(t.url));
    this.playlist.value = [];
    this.currentIndex.value = -1;
  }
}
