import { ref } from 'vue';

/**
 * 音乐轨道接口
 */
export interface Track {
  id: string;
  name: string;
  file: File;
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

  // 进度相关
  public currentTime = ref(0);
  public duration = ref(0);

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
   * 验证文件是否为有效的音频文件（通过尝试全量解码）
   * @param file 文件对象
   */
  private async validateAudio(file: File): Promise<boolean> {
    const audioContext = new AudioContext();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer !== null;
    } catch {
      return false;
    } finally {
      await audioContext.close();
    }
  }

  /**
   * 添加歌曲到列表（带格式校验）
   * @param files 文件列表
   */
  public async addTracksWithValidation(files: File[]) {
    const validTracks: Track[] = [];
    const invalidFiles: string[] = [];

    for (const file of files) {
      const isValid = await this.validateAudio(file);
      if (isValid) {
        validTracks.push({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          file: file,
          url: URL.createObjectURL(file)
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
      // 如果当前没在播放，播放新加的第一首
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

    // 修复：将音频标签连接到分析器
    const sourceNode = this.audioContext!.createMediaElementSource(this.audioTag);
    sourceNode.connect(this.analyser!);
    this.analyser!.connect(this.audioContext!.destination);

    // 确保音频上下文已启动
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
   * 跳转播放时间
   */
  public seek(time: number) {
    if (this.audioTag) {
      this.audioTag.currentTime = time;
    }
  }

  /**
   * 切换播放/暂停
   */
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
