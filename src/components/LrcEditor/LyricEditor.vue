<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { db } from '@/utils/db';
import type { MusicRecord } from '@/utils/db';
import { showConfirm } from '@/components/common/ConfirmDialog';
import LineLyricEditorPanel from './LineLyricEditorPanel.vue';
import WordLyricEditorPanel from './WordLyricEditorPanel.vue';

const props = defineProps<{
  visible: boolean;
  track: MusicRecord | null;
  audio: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', trackId: string, updatedTrack: any): void;
}>();

const activeTab = ref('line'); // 'line' | 'word'
const isSaving = ref(false);

// 编辑状态
const noLyrics = ref(false);
const lineLrc = ref('');
const asrJson = ref<any>(undefined);
const neteaseId = ref('');

const isCorrectTrack = computed(() => {
  const currentTrack = props.audio.playlist.value[props.audio.currentIndex.value];
  return currentTrack && currentTrack.id === props.track?.id;
});

// 初始化数据
watch(() => props.visible, async (val) => {
  if (val && props.track?.id) {
    const latestTrack = await db.music.where('uid').equals(props.track.id as any).first();
    if (latestTrack) {
      noLyrics.value = latestTrack.noLyrics || false;
      lineLrc.value = latestTrack.lineLrc || '';
      asrJson.value = latestTrack.asrJson;
      neteaseId.value = latestTrack.neteaseId || '';
      activeTab.value = 'line';
    }
  }
});

const handleFooterPlay = async () => {
  if (isCorrectTrack.value) {
    props.audio.togglePlay();
  } else {
    const ok = await showConfirm({
      title: '播放提示',
      content: '当前未播放此歌曲，是否立即开始播放？'
    });
    if (ok && props.track) {
      const idx = props.audio.playlist.value.findIndex((t: any) => t.id === props.track?.id);
      if (idx !== -1) props.audio.playTrack(idx);
    }
  }
};

const handleSeek = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  props.audio.seek(parseFloat(val));
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const handleSave = async () => {
  if (!props.track || !props.track.id) return;
  isSaving.value = true;
  try {
    // 关键修复：脱敏 Proxy 状态并同步到 lrcJson 数组
    const cleanAsr = asrJson.value ? JSON.parse(JSON.stringify(asrJson.value)) : undefined;

    const updateData: Partial<MusicRecord> = {
      noLyrics: noLyrics.value,
      lineLrc: lineLrc.value,
      asrJson: cleanAsr,
      // 必须确保 lrcJson 是个数组，AudioSystem 依赖它
      lrcJson: cleanAsr?.utterances || [],
      neteaseId: neteaseId.value
    };

    if (noLyrics.value) {
      updateData.lrcJson = [];
      updateData.asrJson = undefined;
    }

    const updatedCount = await db.music
      .where('uid')
      .equals(props.track.id as any)
      .modify(updateData);

    if (updatedCount > 0) {
      // 实时更新音频系统的当前歌词，确保 UI 立即响应
      if (isCorrectTrack.value) {
        props.audio.currentLyrics.value = updateData.lrcJson;
      }
      
      emit('save', String(props.track.id), updateData);
      emit('close');
    } else {
      alert('保存失败：数据库中未找到该歌曲记录。');
    }
  } catch (err) {
    console.error('保存失败:', err);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="modal-overlay">
      <div class="modal-content">
        <!-- 头部 -->
        <div class="modal-header">
          <div class="header-left">
            <h3>歌词编辑器</h3>
            <span class="track-name">{{ track?.name }}</span>
          </div>
          <div class="header-right">
            <label class="no-lyrics-toggle">
              <input type="checkbox" v-model="noLyrics">
              <span class="toggle-text">标记为无歌词</span>
            </label>
            <button class="close-btn" @click="emit('close')">
              <i class="iconfont icon-guanbi_o"></i>
            </button>
          </div>
        </div>

        <!-- 主体区域 -->
        <div class="modal-body" v-show="!noLyrics">
          <!-- Tab 切换 -->
          <div class="editor-tabs">
            <button
              :class="['tab-btn', { active: activeTab === 'line' }]"
              @click="activeTab = 'line'"
            >逐行歌词 (LRC)</button>
            <button
              :class="['tab-btn', { active: activeTab === 'word' }]"
              @click="activeTab = 'word'"
            >分词歌词 (逐字)</button>
          </div>

          <!-- Tab 内容 -->
          <div class="tab-content">
            <!-- 逐行歌词面板 -->
            <div v-show="activeTab === 'line'" class="panel-wrapper">
              <LineLyricEditorPanel
                v-model:lineLrc="lineLrc"
                :track="track"
                :audio="audio"
                :is-correct-track="isCorrectTrack"
              />
            </div>

            <!-- 分词歌词面板 -->
            <div v-show="activeTab === 'word'" class="panel-wrapper">
              <WordLyricEditorPanel
                v-model:asrJson="asrJson"
                :track="track"
                :audio="audio"
                :lineLrc="lineLrc"
                :is-correct-track="isCorrectTrack"
              />
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="modal-footer">
          <div class="footer-player">
            <button class="player-btn" @click="handleFooterPlay">
              <i :class="['iconfont', (isCorrectTrack && audio.isPlaying.value) ? 'icon-zanting' : 'icon-bofang']"></i>
            </button>
            <div class="player-progress-wrap">
              <span class="time-label">{{ isCorrectTrack ? formatTime(audio.currentTime.value) : '00:00' }}</span>
              <input
                type="range"
                class="progress-slider"
                :min="0"
                :max="isCorrectTrack ? audio.duration.value : 100"
                :value="isCorrectTrack ? audio.currentTime.value : 0"
                :disabled="!isCorrectTrack"
                @input="handleSeek"
              >
              <span class="time-label">{{ isCorrectTrack ? formatTime(audio.duration.value) : '00:00' }}</span>
            </div>
          </div>
          <div class="footer-actions">
            <button class="btn-secondary" @click="emit('close')">取消</button>
            <button class="btn-primary" :disabled="isSaving" @click="handleSave">
              {{ isSaving ? '保存中...' : '确认并保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  padding: 2rem;
}

.modal-content {
  background: #111;
  width: 100%;
  max-width: 900px;
  height: 80vh;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 1.2rem 2rem;
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-left h3 { margin: 0; font-weight: 400; font-size: 1.1rem; }
.track-name { font-size: 0.8rem; color: #00ffff; opacity: 0.7; }

.header-right { display: flex; align-items: center; gap: 2rem; }

.no-lyrics-toggle {
  display: flex; align-items: center; gap: 0.6rem; cursor: pointer;
  padding: 6px 12px; background: rgba(255, 255, 255, 0.05);
  border-radius: 6px; transition: all 0.3s;
}
.no-lyrics-toggle:hover { background: rgba(255, 85, 85, 0.1); }
.toggle-text { font-size: 0.85rem; color: rgba(255, 255, 255, 0.6); }

.modal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-tabs {
  display: flex; gap: 1px; background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem 1rem;
  flex-shrink: 0;
}

.tab-btn {
  background: none; border: none; color: rgba(255, 255, 255, 0.4);
  padding: 0.6rem 1.2rem; font-size: 0.85rem; cursor: pointer;
  transition: all 0.3s; border-radius: 6px;
}
.tab-btn.active { background: rgba(0, 255, 255, 0.1); color: #00ffff; }

.tab-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 每个面板绝对铺满 tab-content */
.panel-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  overflow: hidden;
}

.modal-footer {
  padding: 1rem 2rem;
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.footer-player {
  flex: 1; display: flex; align-items: center; gap: 1.5rem; padding-right: 2rem;
}

.player-btn {
  background: #00ffff; border: none;
  width: 36px !important; height: 36px !important;
  min-width: 36px !important; min-height: 36px !important;
  border-radius: 50% !important;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0 !important; margin: 0 !important;
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.3); transition: all 0.3s;
  flex-shrink: 0 !important;
  aspect-ratio: 1 / 1 !important;
  overflow: hidden;
}
.player-btn:hover { transform: scale(1.1); }
.player-btn i { color: #000; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; }
.player-btn i.icon-bofang { transform: translateX(1px); }

.player-progress-wrap {
  flex: 1; display: flex; align-items: center; gap: 0.8rem;
}

.time-label { font-size: 0.75rem; color: rgba(255, 255, 255, 0.4); font-family: monospace; min-width: 35px; }

.progress-slider {
  flex: 1; -webkit-appearance: none; background: rgba(255, 255, 255, 0.1);
  height: 4px; border-radius: 2px; outline: none; cursor: pointer;
}
.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px; background: #00ffff;
  border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

.footer-actions { display: flex; gap: 1rem; }

.btn-secondary {
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5); padding: 0.6rem 1.5rem; border-radius: 8px; cursor: pointer;
}

.btn-primary {
  background: #00ffff; border: none; color: #000;
  padding: 0.6rem 2.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;
}

/* 动画 */
.modal-fade-enter-active { transition: all 0.3s ease; }
.modal-fade-leave-active { transition: none; }
.modal-fade-enter-from { opacity: 0; transform: scale(0.95); }
</style>
