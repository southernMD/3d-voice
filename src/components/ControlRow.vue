<script setup lang="ts">
import { ref, computed } from 'vue';
import { type AudioSystem, PlayMode } from '@/utils/audioSystem';

const props = defineProps<{
  audio: AudioSystem;
}>();

// 音量控制本地逻辑
const lastVolume = ref(0.7);

const handleVolumeChange = (e: Event) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  props.audio.setVolume(val);
  if (val > 0) lastVolume.value = val;
};

const toggleMute = () => {
  if (props.audio.volume.value > 0) {
    lastVolume.value = props.audio.volume.value;
    props.audio.setVolume(0);
  } else {
    props.audio.setVolume(lastVolume.value || 0.7);
  }
};

const togglePlayMode = () => {
  const modes = [PlayMode.ListLoop, PlayMode.SingleLoop, PlayMode.Random];
  const currentIndex = modes.indexOf(props.audio.playMode.value);
  const nextMode = modes[(currentIndex + 1) % modes.length];
  props.audio.playMode.value = nextMode;
};

const playModeIcon = computed(() => {
  switch (props.audio.playMode.value) {
    case PlayMode.ListLoop: return 'icon-xunhuanbofang';
    case PlayMode.SingleLoop: return 'icon-danquxunhuan';
    case PlayMode.Random: return 'icon-caozuo-xunhuan1';
    default: return 'icon-xunhuanbofang';
  }
});

const playModeTitle = computed(() => {
  switch (props.audio.playMode.value) {
    case PlayMode.ListLoop: return '列表循环';
    case PlayMode.SingleLoop: return '单曲循环';
    case PlayMode.Random: return '随机播放';
    default: return '列表循环';
  }
});
</script>

<template>
  <div class="control-row">
    <!-- 播放模式切换 -->
    <div class="mode-wrapper">
      <button class="mode-btn" @click="togglePlayMode" :title="playModeTitle">
        <i :class="['iconfont', playModeIcon]"></i>
      </button>
    </div>

    <!-- 播放按钮组 -->
    <div class="playback-btns">
      <button class="icon-btn" @click="audio.prev()" title="上一首">
        <i class="iconfont icon-shangyishou"></i>
      </button>
      <button class="play-pause-btn" @click="audio.togglePlay()" :title="audio.isPlaying.value ? '暂停' : '播放'">
        <i :class="['iconfont', audio.isPlaying.value ? 'icon-zanting' : 'icon-gf-play']"></i>
      </button>
      <button class="icon-btn" @click="audio.next()" title="下一首">
        <i class="iconfont icon-xiayishou"></i>
      </button>
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
        <i :class="['iconfont', audio.volume.value === 0 ? 'icon-shengyinguanbi' : 'icon-shengyin']"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
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
}

/* 播放模式样式 */
.mode-wrapper {
  display: flex;
  align-items: center;
}

.mode-btn {
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
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
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

/* 音量控制样式 */
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
  appearance: slider-vertical;
}

.vol-slider-vertical::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .control-row {
    flex-direction: column;
    gap: 1.5rem;
  }

  .playback-btns {
    margin-left: 0;
    gap: 1.5rem;
  }

  .volume-wrapper {
    display: none;
  }
}
</style>
