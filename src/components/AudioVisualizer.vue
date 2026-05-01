<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { AudioSystem } from '@/utils/audioSystem';
import { Visualizer } from '@/utils/visualizer';
import { TunnelPreset, SymmetricTunnelPreset } from '@/utils/visualizer/presets';
import { useViewport } from '@/utils/viewport';
import Drawer from './common/Drawer.vue';
import ControlRow from './ControlRow.vue';
import PlaylistPanel from './PlaylistPanel.vue';
import DragUpload from './DragUpload.vue';

// 引用与状态
const container = ref<HTMLElement | null>(null);
const playlistVisible = ref(false);
const showSettings = ref(false);
const currentPresetName = ref('赛博环绕');

// 可用预设列表
const presets = [
  new TunnelPreset(),
  new SymmetricTunnelPreset(),
];

const changePreset = (preset: any) => {
  view.setPreset(preset);
  currentPresetName.value = preset.name;
  showSettings.value = false;
};

// 初始化系统 (单例)
const audio = new AudioSystem();
const view = new Visualizer();
const viewport = useViewport();
let animationId: number;

onMounted(async () => {
  // 初始化视口监控
  viewport.init();

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
  viewport.destroy();
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

const handleDroppedFiles = async (files: File[]) => {
  if (files.length > 0) {
    await audio.addTracksWithValidation(files);
    if (!playlistVisible.value) playlistVisible.value = true;
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

const handleBilibiliImport = async () => {
  const url = prompt('请输入 Bilibili 视频链接 (如: https://www.bilibili.com/video/BV...)');
  if (!url) return;

  try {
    const track = await audio.addBiliTrack(url);
    alert(`成功添加：${track.name}`);
  } catch (err) {
    console.error('导入 B 站音频失败:', err);
    alert('导入失败，请检查链接有效性或 CORS 限制。');
  }
};

const handleNeteaseImport = async () => {
  const url = prompt('请输入网易云音乐链接 (如: https://music.163.com/#/song?id=...)');
  if (!url) return;

  try {
    const track = await audio.addNeteaseTrack(url);
    alert(`成功添加：${track.name}`);
  } catch (err) {
    console.error('导入网易云音乐失败:', err);
    alert('导入失败，该歌曲可能受版权保护或链接无效。');
  }
};

const isFullscreen = ref(false);
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
    isFullscreen.value = true;
  } else {
    document.exitFullscreen();
    isFullscreen.value = false;
  }
};

// 监听全屏变化
onMounted(() => {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });
});
</script>

<template>
  <div class="visualizer-container">
    <!-- 全局下载进度条 -->
    <div class="global-download-progress" v-show="audio.downloadProgress.value > 0">
      <div class="progress-inner" :style="{ width: audio.downloadProgress.value + '%' }"></div>
      <div class="download-info" v-if="audio.downloadingName.value">
        正在下载: {{ audio.downloadingName.value }} ({{ audio.downloadProgress.value.toFixed(0) }}%)
      </div>
    </div>

    <DragUpload @dropped="handleDroppedFiles" />

    <div ref="container" class="three-container"></div>
    
    <div class="top-bar">
      <div class="branding">
        <h1 class="main-title">3D 沉浸式频谱</h1>
      </div>
      
      <div class="top-actions">
        <div class="current-track" v-if="audio.fileName.value">
          <span class="music-icon">
            <i class="iconfont icon-yinle"></i>
          </span>
          <span class="track-name">{{ audio.fileName.value }}</span>
        </div>

        <button class="fullscreen-btn glass" @click="toggleFullscreen">
          <span style="font-size: 0.75em;">{{ isFullscreen? '取消' : '全屏' }}</span>
        </button>
      </div>
    </div>

    <!-- 左侧视觉设置抽屉 -->
    <Drawer 
      :visible="showSettings" 
      title="视觉设置" 
      direction="left" 
      width="320px"
      @close="showSettings = false"
    >
      <div class="preset-list-drawer">
        <button 
          v-for="p in presets" 
          :key="p.name"
          :class="['preset-item-drawer', { active: currentPresetName === p.name }]"
          @click="changePreset(p)"
        >
          <span>{{ p.name }}</span>
          <i class="iconfont icon-check" v-if="currentPresetName === p.name"></i>
        </button>
      </div>
    </Drawer>

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

      <!-- 拆分出的控制栏组件 -->
      <ControlRow :audio="audio" />

      <div class="action-btns">
        <button class="btn glass" @click="handleBilibiliImport">
          <i class="iconfont icon-yinle" style="margin-right: 5px;"></i>
          B站链接
        </button>
        <button class="btn glass" @click="handleNeteaseImport">
          <i class="iconfont icon-yinle" style="margin-right: 5px;"></i>
          网易云
        </button>
        <button class="btn glass" @click="handleFileUpload">
          <i class="iconfont icon-tianjiawenjian" style="margin-right: 5px;"></i>
          本地
        </button>
        <button class="btn glass" @click="showSettings = true">
          <i class="iconfont icon-chakan" style="margin-right: 5px;"></i>
          视觉
        </button>
        <button class="btn glass playlist-btn" @click="playlistVisible = true">
          <i class="iconfont icon-24gf-playlist" style="margin-right: 5px;"></i>
          列表 ({{ audio.playlist.value.length }})
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
  width: 100vw;
  height: var(--visual-height, 100vh);
  position: relative;
  background: #050505;
  overflow: hidden;
  color: white;
}

.global-download-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.progress-inner {
  height: 100%;
  background: linear-gradient(90deg, #00ffff, #ff00ff);
  transition: width 0.1s ease-out;
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.8);
}

.download-info {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
  letter-spacing: 0.05em;
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

.top-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  pointer-events: auto;
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
}

.fullscreen-btn, .settings-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  padding: 0;
  transition: all 0.3s ease;
  pointer-events: auto;
}

.fullscreen-btn:hover, .settings-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.1);
}

/* 抽屉内预设列表样式 */
.preset-list-drawer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 1.5rem;
}

.preset-item-drawer {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  padding: 1.2rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  text-align: left;
}

.preset-item-drawer:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.preset-item-drawer.active {
  background: rgba(0, 255, 255, 0.1);
  border-color: #00ffff;
  color: #00ffff;
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.2);
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
    display: none;
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
    flex-wrap: wrap; /* 按钮过多时换行 */
  }

  .btn.glass {
    flex: 1;
    min-width: 80px;
    text-align: center;
    padding: 0.5rem;
  }
}
</style>
