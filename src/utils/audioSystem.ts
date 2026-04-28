import { ref } from 'vue';
import { db } from './db';

/**
 * 音乐轨道接口
 */
export interface Track {
  id: string;
  name: string;
  blob: Blob; // 改为存储 Blob
  url: string;
}

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
      this.next();
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
      this.audioTag.play().catch(() => {});
    }
    this.isPlaying.value = !this.isPlaying.value;
  }

  public next() {
    if (this.playlist.value.length === 0) return;
    const nextIndex = (this.currentIndex.value + 1) % this.playlist.value.length;
    this.playTrack(nextIndex);
  }

  public prev() {
    if (this.playlist.value.length === 0) return;
    const prevIndex = (this.currentIndex.value - 1 + this.playlist.value.length) % this.playlist.value.length;
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
