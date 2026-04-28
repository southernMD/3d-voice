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

onMounted(() => {
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

/**
 * 使用 File System API 选择并上传文件
 */
const handleFileUpload = async () => {
  try {
    // 调用 File System Access API
    const fileHandles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [] // 允许所有类型
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
    // 忽略用户取消选择的情况
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

/**
 * 格式化时间为 MM:SS
 */
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 进度百分比
 */
const progressPercent = computed(() => {
  if (audio.duration.value === 0) return 0;
  return (audio.currentTime.value / audio.duration.value) * 100;
});

/**
 * 跳转播放时间
 */
const onProgressClick = (e: MouseEvent) => {
  const bar = e.currentTarget as HTMLElement;
  const rect = bar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = x / rect.width;
  audio.seek(percentage * audio.duration.value);
};
</script>

<template>
  <div class="visualizer-container">
    <!-- 3D 渲染器 -->
    <div ref="container" class="three-container"></div>
    
    <!-- 顶部标题与当前信息 -->
    <div class="top-bar">
      <div class="branding">
        <h1>3D 沉浸式频谱</h1>
      </div>
      <div class="current-track" v-if="audio.fileName.value">
        <span class="music-icon">🎵</span>
        <span class="track-name">{{ audio.fileName.value }}</span>
      </div>
    </div>

    <!-- 底部控制栏 -->
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

      <div class="playback-btns">
        <button class="icon-btn" @click="audio.prev()" title="上一首">⏮</button>
        <button class="play-pause-btn" @click="audio.togglePlay()" :title="audio.isPlaying.value ? '暂停' : '播放'">
          {{ audio.isPlaying.value ? '⏸' : '▶' }}
        </button>
        <button class="icon-btn" @click="audio.next()" title="下一首">⏭</button>
      </div>

      <div class="action-btns">
        <button class="btn glass" @click="handleFileUpload">添加音乐</button>
        <button class="btn glass" @click="playlistVisible = true">
          播放列表 ({{ audio.playlist.value.length }})
        </button>
      </div>
    </div>

    <!-- 播放列表子组件 -->
    <PlaylistPanel 
      :audio="audio" 
      :visible="playlistVisible" 
      @close="playlistVisible = false" 
    />
  </div>
</template>

<style scoped>
.visualizer-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background: #050505;
  overflow: hidden;
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
  bottom: 2.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  z-index: 100;
  width: 100%;
  max-width: 800px;
  padding: 0 2rem;
}

/* 进度条样式 */
.progress-container {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
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
  transition: height 0.2s;
}

.progress-bar-wrapper:hover .progress-bar-bg {
  height: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00ffff, #ff00ff);
  border-radius: 2px;
  position: relative;
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
}

.playback-btns {
  display: flex;
  align-items: center;
  gap: 2rem;
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

.play-pause-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 0 30px rgba(255, 255, 255, 0.4);
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

.action-btns {
  display: flex;
  gap: 1.2rem;
}

.btn.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  padding: 0.6rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.8rem;
  letter-spacing: 1px;
}

.btn.glass:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: white;
}

.hidden-input {
  display: none;
}
</style>
