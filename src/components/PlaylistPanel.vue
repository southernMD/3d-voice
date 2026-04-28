<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { gsap } from 'gsap';
import type { AudioSystem } from '@/utils/audioSystem';

const props = defineProps<{
  audio: AudioSystem;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const panel = ref<HTMLElement | null>(null);
const mask = ref<HTMLElement | null>(null);

// 监听可见性变化，执行动画
watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      // 面板滑入
      if (panel.value) {
        gsap.fromTo(panel.value, 
          { x: 400, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }
        );
      }
      // 遮罩淡入
      if (mask.value) {
        gsap.fromTo(mask.value,
          { opacity: 0 },
          { opacity: 1, duration: 0.5 }
        );
      }
    });
  }
});

/**
 * 关闭逻辑：先播放退出动画，再通知父组件
 */
const close = () => {
  const tl = gsap.timeline({
    onComplete: () => emit('close')
  });

  if (panel.value) {
    tl.to(panel.value, {
      x: 400,
      opacity: 0,
      duration: 0.4,
      ease: 'power3.in'
    }, 0);
  }

  if (mask.value) {
    tl.to(mask.value, {
      opacity: 0,
      duration: 0.4
    }, 0);
  }
  
  if (!panel.value && !mask.value) {
    emit('close');
  }
};
</script>

<template>
  <div v-if="visible" class="playlist-wrapper">
    <!-- 背景遮罩：点击空白处关闭 -->
    <div ref="mask" class="playlist-mask" @click="close"></div>

    <!-- 播放列表面板 -->
    <!-- 播放列表面板 -->
    <div ref="panel" class="playlist-panel">
      <div class="panel-header">
        <h2>播放列表</h2>
        <div class="header-btns">
          <button v-if="audio.playlist.value.length > 0" class="clear-btn" @click="audio.clearAll()">清空列表</button>
          <button class="close-btn" @click="close">×</button>
        </div>
      </div>
      
      <div class="track-list">
        <div 
          v-for="(track, index) in audio.playlist.value" 
          :key="track.id" 
          :class="['track-item', { active: audio.currentIndex.value === index }]"
          @click="audio.playTrack(index)"
        >
          <div class="track-idx">{{ index + 1 }}</div>
          <div class="track-info">
            <div class="track-title">{{ track.name }}</div>
          </div>
          
          <div class="track-actions">
            <!-- 播放中动画状态 -->
            <div v-if="audio.currentIndex.value === index && audio.isPlaying.value" class="playing-indicator">
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
            </div>
            <!-- 删除按钮 -->
            <button class="remove-btn" @click.stop="audio.removeTrack(index)" title="从缓存移除">🗑</button>
          </div>
        </div>

        <div v-if="audio.playlist.value.length === 0" class="empty-tip">
          还没有歌曲<br>请点击左下角“添加音乐”
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playlist-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  pointer-events: none;
}

.playlist-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.playlist-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 350px;
  height: 100%;
  background: rgba(10, 10, 10, 0.8);
  backdrop-filter: blur(40px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
}

.panel-header {
  padding: 0.5rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-header h2 {
  margin: 0;
  font-weight: 200;
  font-size: 1.3rem;
  letter-spacing: 0.3rem;
  color: rgba(255, 255, 255, 0.9);
}

.header-btns {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.clear-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.clear-btn:hover {
  background: rgba(255, 50, 50, 0.2);
  color: #ff5555;
  border-color: #ff5555;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.close-btn:hover {
  opacity: 1;
}

.track-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.track-list::-webkit-scrollbar {
  width: 4px;
}
.track-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.track-item {
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  gap: 1.2rem;
  border-left: 3px solid transparent;
}

.track-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.track-item.active {
  background: rgba(0, 255, 255, 0.08);
  border-left-color: #00ffff;
}

.track-idx {
  font-family: 'JetBrains Mono', monospace;
  opacity: 0.3;
  font-size: 0.8rem;
  width: 20px;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.8);
}

.track-item.active .track-title {
  color: #00ffff;
  font-weight: 500;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.remove-btn {
  background: none;
  border: none;
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s;
}

.track-item:hover .remove-btn {
  opacity: 0.4;
  transform: scale(1);
}

.remove-btn:hover {
  opacity: 1 !important;
  color: #ff5555;
}

.playing-indicator {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 14px;
}

.playing-indicator .bar {
  width: 2px;
  background: #00ffff;
  animation: bounce 0.8s ease-in-out infinite alternate;
}

.playing-indicator .bar:nth-child(2) { animation-delay: 0.2s; }
.playing-indicator .bar:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  from { height: 3px; }
  to { height: 14px; }
}

.empty-tip {
  padding: 4rem 2rem;
  text-align: center;
  opacity: 0.3;
  font-size: 0.85rem;
  line-height: 1.6;
}
</style>
