import { ref } from 'vue';
import { db } from './db';
import { getVideoMsg, getVideoDowloadLink } from './bilibili';
import { getNeteaseMusicMsg } from './netease';

/**
 * 音乐轨道接口
 */
export interface Track {
  id: string;
  name: string;
  blob: Blob;
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

  // 下载状态监控
  public downloadProgress = ref(0);
  public downloadingName = ref('');

  // 下载队列锁（确保并发任务排队执行）
  private downloadQueue = Promise.resolve();

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
   * 带进度的下载方法（内部实现）
   */
  private async _doFetchWithProgress(url: string, name: string, options: RequestInit = {}) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      let loaded = 0;
      const chunks: BlobPart[] = [];

      console.log(`[Download] 开始下载: ${name}`);
      this.downloadingName.value = name;
      this.downloadProgress.value = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (total > 0) {
          const progress = (loaded / total) * 100;
          this.downloadProgress.value = progress;
        }
      }

      console.log(`[Download] 下载完成: ${name}`);
      this.downloadProgress.value = 100;

      // 下载完成后短暂延迟重置，给用户一点感官反馈
      await new Promise(r => setTimeout(r, 600));
      return new Blob(chunks);
    } finally {
      // 无论成功还是失败，都要清理状态，防止 UI 卡死
      this.downloadProgress.value = 0;
      this.downloadingName.value = '';
    }
  }

  /**
   * 排队执行的下载方法（外部调用）
   */
  private async fetchWithProgress(url: string, name: string, options: RequestInit = {}): Promise<Blob> {
    // 将任务链式挂载到 Promise 队列上
    const task = this.downloadQueue.then(() => this._doFetchWithProgress(url, name, options));

    // 更新队列锁，确保即便任务失败，队列也能继续走下一个
    this.downloadQueue = task.then(() => { }).catch(() => { });

    return task;
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
      const isValid = await this.validateAudio(file);
      if (isValid) {
        const uid = Math.random().toString(36).substring(2, 9);
        const pureBlob = new Blob([file], { type: file.type });

        validTracks.push({
          id: uid,
          name: file.name,
          blob: pureBlob,
          url: URL.createObjectURL(pureBlob)
        });

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
    const info = await getVideoMsg(url, sessData);
    if (!info) throw new Error('无法获取视频信息');

    const title = info.title;
    const cid = info.cid;
    const bvid = info.bvid;

    const downloadData = await getVideoDowloadLink(cid, bvid, sessData);
    const audioUrl = downloadData.audio.base_url || downloadData.audio.baseUrl;
    if (!audioUrl) throw new Error('未找到有效的音频轨道');

    const isProd = import.meta.env.PROD;
    const referer = `https://www.bilibili.com/video/${bvid}`;
    const fetchUrl = isProd
      ? `/api/download?url=${encodeURIComponent(audioUrl)}&referer=${encodeURIComponent(referer)}`
      : `/bili-download?url=${encodeURIComponent(audioUrl)}&referer=${encodeURIComponent(referer)}`;

    const blob = await this.fetchWithProgress(fetchUrl, title, {
      headers: sessData ? { 'X-Bili-Sessdata': sessData } : {}
    });

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
    if (this.currentIndex.value === -1) {
      this.playTrack(this.playlist.value.length - 1);
    }
    return track;
  }

  /**
   * 通过网易云音乐链接添加歌曲
   */
  public async addNeteaseTrack(url: string) {
    const info = await getNeteaseMusicMsg(url);
    if (!info) throw new Error('无法获取歌曲信息');

    const blob = await this.fetchWithProgress(info.url, info.name);

    const uid = `netease-${Date.now()}`;
    await db.music.add({
      uid,
      name: `${info.name} - ${info.artist}`,
      data: blob,
    });

    const track: Track = {
      id: uid,
      name: `${info.name} - ${info.artist}`,
      blob,
      url: URL.createObjectURL(blob)
    };

    this.playlist.value.push(track);
    if (this.currentIndex.value === -1) {
      this.playTrack(this.playlist.value.length - 1);
    }
    return track;
  }

  /**
   * 播放指定索引的歌曲
   */
  public playTrack(index: number) {
    if (index < 0 || index >= this.playlist.value.length) return;

    this.ensureContext();
    this.stopCurrent();

    const track = this.playlist.value[index]!;
    this.currentIndex.value = index;
    this.fileName.value = track.name;

    this.audioTag = new Audio();
    this.audioTag.src = track.url;
    this.audioTag.crossOrigin = "anonymous";
    this.audioTag.volume = this.volume.value;

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

    track.name = newName;
    if (this.currentIndex.value !== -1 && this.playlist.value[this.currentIndex.value]!.id === id) {
      this.fileName.value = newName;
    }

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
