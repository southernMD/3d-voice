<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { AudioSystem } from '@/utils/audioSystem';
import { Visualizer } from '@/utils/visualizer';
import PlaylistPanel from './PlaylistPanel.vue';

// 引用与状态
const container = ref<HTMLElement | null>(null);
const playlistVisible = ref(false);

// 初始化系统 (单例)
const audio = new AudioSystem();
const view = new Visualizer();
let animationId: number;

onMounted(async () => {
  // 加载缓存的音乐
  await audio.init();
  
  if (container.value) {
    view.init(container.value);
    animate();
  }
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  cancelAnimationFrame(animationId);
  audio.dispose();
  view.dispose();
});

const animate = () => {
  animationId = requestAnimationFrame(animate);
  const data = audio.getFrequencyData();
  view.update(data);
};

const handleFileUpload = async () => {
  try {
    const fileHandles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [] 
    });

    const files: File[] = [];
    for (const handle of fileHandles) {
      const file = await handle.getFile();
      files.push(file);
    }

    if (files.length > 0) {
      await audio.addTracksWithValidation(files);
      if (!playlistVisible.value) playlistVisible.value = true;
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('选择文件出错:', err);
    }
  }
};

const handleResize = () => {
  if (container.value) {
    view.resize(window.innerWidth, window.innerHeight);
  }
};

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const progressPercent = computed(() => {
  if (audio.duration.value === 0) return 0;
  return (audio.currentTime.value / audio.duration.value) * 100;
});

const onProgressClick = (e: MouseEvent) => {
  const bar = e.currentTarget as HTMLElement;
  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = x / rect.width;
  audio.seek(percentage * audio.duration.value);
};

// 音量控制逻辑
const lastVolume = ref(0.7);

const handleVolumeChange = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  audio.setVolume(val);
  if (val > 0) lastVolume.value = val;
};

const toggleMute = () => {
  if (audio.volume.value > 0) {
    lastVolume.value = audio.volume.value;
    audio.setVolume(0);
  } else {
    audio.setVolume(lastVolume.value || 0.7);
  }
};
</script>

<template>
  <div class="visualizer-container">
    <div ref="container" class="three-container"></div>
    
    <div class="top-bar">
      <div class="branding">
        <h1>3D 沉浸式频谱</h1>
      </div>
      <div class="current-track" v-if="audio.fileName.value">
        <span class="music-icon">🎵</span>
        <span class="track-name">{{ audio.fileName.value }}</span>
      </div>
    </div>

    <div class="bottom-controls">
      <!-- 进度条 -->
      <div class="progress-container">
        <span class="time">{{ formatTime(audio.currentTime.value) }}</span>
        <div class="progress-bar-wrapper" @click="onProgressClick">
          <div class="progress-bar-bg">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
        <span class="time">{{ formatTime(audio.duration.value) }}</span>
      </div>

      <div class="control-row">
        <!-- 播放按钮组 -->
        <div class="playback-btns">
          <button class="icon-btn" @click="audio.prev()" title="上一首">⏮</button>
          <button class="play-pause-btn" @click="audio.togglePlay()" :title="audio.isPlaying.value ? '暂停' : '播放'">
            {{ audio.isPlaying.value ? '⏸' : '▶' }}
          </button>
          <button class="icon-btn" @click="audio.next()" title="下一首">⏭</button>
        </div>

        <!-- 音量控制 (悬浮竖向滑块) -->
        <div class="volume-wrapper">
          <div class="volume-popover">
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              :value="audio.volume.value" 
              @input="handleVolumeChange"
              class="vol-slider-vertical"
            />
          </div>
          <button class="vol-btn" @click="toggleMute">
            {{ audio.volume.value === 0 ? '🔇' : '🔊' }}
          </button>
        </div>
      </div>

      <div class="action-btns">
        <button class="btn glass" @click="handleFileUpload">添加音乐</button>
        <button class="btn glass" @click="playlistVisible = true">
          播放列表 ({{ audio.playlist.value.length }})
        </button>
      </div>
    </div>

    <PlaylistPanel 
      :audio="audio" 
      :visible="playlistVisible" 
      @close="playlistVisible = false" 
    />
  </div>
</template>

<style scoped>
.visualizer-container {
  --vh: 1vh;
  overflow: hidden;
  height: calc(100 * var(--vh));
  width: 100vw;
  position: relative;
  background: #050505;
  color: white;
}

.three-container {
  width: 100%;
  height: 100%;
}

.top-bar {
  position: absolute;
  top: 2rem;
  left: 2rem;
  right: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}

.branding h1 {
  margin: 0;
  font-weight: 100;
  font-size: 1.6rem;
  letter-spacing: 0.5rem;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}

.current-track {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  padding: 0.8rem 1.5rem;
  border-radius: 50px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  pointer-events: auto;
}

.track-name {
  font-family: 'Inter', sans-serif;
  font-weight: 300;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.bottom-controls {
  position: absolute;
  bottom: calc(1.5rem + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  z-index: 100;
  width: 100%;
  max-width: 900px;
  padding: 0 1.5rem;
  pointer-events: none;
}

.bottom-controls > * {
  pointer-events: auto; /* 恢复子元素的点击 */
}

.progress-container {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  opacity: 0.5;
  min-width: 40px;
}

.progress-bar-wrapper {
  flex: 1;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.progress-bar-bg {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00ffff, #ff00ff);
  border-radius: 2px;
  position: relative;
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
}

.control-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
}

.playback-btns {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex: 1;
  justify-content: center;
  margin-left: 100px; /* 偏移以居中 */
}

.play-pause-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: white;
  color: black;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.icon-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.6rem;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.3s;
}

.icon-btn:hover {
  opacity: 1;
  transform: scale(1.2);
}

/* 音量控制新样式 */
.volume-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.vol-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: all 0.3s;
  z-index: 2;
}

.vol-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.volume-popover {
  position: absolute;
  bottom: 55px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 15, 15, 0.9);
  backdrop-filter: blur(20px);
  padding: 15px 8px;
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.volume-wrapper:hover .volume-popover {
  opacity: 1;
  visibility: visible;
  bottom: 60px;
}

.vol-slider-vertical {
  -webkit-appearance: none;
  width: 4px;
  height: 100px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  appearance: slider-vertical; /* 现代浏览器支持竖向 */
  writing-mode: bt-lr; /* 某些旧版写法 */
}

/* 如果浏览器不支持 appearance: slider-vertical，手动旋转 */
@supports not (appearance: slider-vertical) {
  .vol-slider-vertical {
    transform: rotate(-90deg);
    width: 100px;
    height: 4px;
    margin: 48px 0;
  }
}

.vol-slider-vertical::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.action-btns {
  display: flex;
  gap: 1rem;
}

.btn.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
}
/* 移动端适配 */
@media (max-width: 768px) {
  .branding h1 {
    font-size: 1.1rem;
    letter-spacing: 0.2rem;
  }
  
  .top-bar {
    top: 1rem;
    left: 1rem;
    right: 1rem;
  }

  .current-track {
    padding: 0.5rem 1rem;
  }

  .track-name {
    max-width: 150px;
    font-size: 0.8rem;
  }

  .control-row {
    flex-direction: column;
    gap: 1.5rem;
  }

  .playback-btns {
    margin-left: 0;
    gap: 1.5rem;
  }

  .volume-wrapper {
    display: none; /* 移动端通常直接使用系统音量，隐藏自定义滑块以节省空间 */
  }

  .action-btns {
    width: 100%;
    justify-content: center;
  }

  .btn.glass {
    flex: 1;
    text-align: center;
    padding: 0.5rem;
  }
}
</style>
