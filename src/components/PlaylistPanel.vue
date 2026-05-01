<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import type { AudioSystem } from '@/utils/audioSystem';
import Drawer from './common/Drawer.vue';

const props = defineProps<{
  audio: AudioSystem;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// 搜索逻辑
const searchQuery = ref('');
const filteredPlaylist = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return props.audio.playlist.value;
  return props.audio.playlist.value.filter(t => 
    t.name.toLowerCase().includes(query)
  );
});

// 重命名逻辑
const editingId = ref<string | null>(null);
const editName = ref('');
const editInput = ref<HTMLInputElement | null>(null);

const startRename = (id: string, currentName: string) => {
  editingId.value = id;
  editName.value = currentName;
  nextTick(() => {
    editInput.value?.focus();
    editInput.value?.select();
  });
};

const saveRename = async () => {
  if (editingId.value && editName.value.trim()) {
    await props.audio.renameTrack(editingId.value, editName.value.trim());
  }
  editingId.value = null;
};

const cancelRename = () => {
  editingId.value = null;
};
</script>

<template>
  <Drawer 
    :visible="visible" 
    title="播放列表" 
    direction="right" 
    width="380px"
    @close="emit('close')"
  >
    <!-- 自定义头部右侧按钮 -->
    <template #header>
      <div class="panel-header-content">
        <h2>播放列表</h2>
        <div class="header-actions">
          <button v-if="audio.playlist.value.length > 0" class="clear-btn" @click="audio.clearAll()">清空</button>
          <button class="close-icon" @click="emit('close')">
            <i class="iconfont icon-guanbi_o"></i>
          </button>
        </div>
      </div>
    </template>

    <div class="playlist-inner">
      <!-- 搜索栏 -->
      <div class="search-container">
        <div class="search-bar">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="搜索音乐..." 
            class="search-input"
          />
          <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
            <i class="iconfont icon-guanbi_o" style="font-size: 0.8rem;"></i>
          </span>
        </div>
      </div>
      
      <div class="track-list">
        <div 
          v-for="(track) in filteredPlaylist" 
          :key="track.id" 
          :class="['track-item', { active: audio.currentIndex.value === audio.playlist.value.findIndex(t => t.id === track.id) }]"
          @click="editingId !== track.id && audio.playTrack(audio.playlist.value.findIndex(t => t.id === track.id))"
        >
          <div class="track-idx">{{ audio.playlist.value.findIndex(t => t.id === track.id) + 1 }}</div>
          
          <div class="track-info">
            <input 
              v-if="editingId === track.id"
              ref="editInput"
              v-model="editName"
              class="edit-input"
              @blur="saveRename"
              @keyup.enter="saveRename"
              @keyup.esc="cancelRename"
              @click.stop
            />
            <div v-else class="track-title">{{ track.name }}</div>
          </div>
          
          <div class="track-actions">
            <!-- 播放状态 -->
            <div v-if="audio.currentIndex.value === audio.playlist.value.findIndex(t => t.id === track.id) && audio.isPlaying.value" class="playing-indicator">
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
            </div>
            <button class="action-btn" @click.stop="startRename(track.id, track.name)" title="重命名">
              <i class="iconfont icon-bianji"></i>
            </button>
            <button class="action-btn remove" @click.stop="audio.removeTrack(audio.playlist.value.findIndex(t => t.id === track.id))" title="移除">
              <i class="iconfont icon-lajixiang"></i>
            </button>
          </div>
        </div>

        <div v-if="filteredPlaylist.length === 0" class="empty-tip">
          {{ searchQuery ? '没有匹配的音乐' : '还没有歌曲，请添加音乐' }}
        </div>
      </div>
    </div>
  </Drawer>
</template>

<style scoped>
.panel-header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header-content h2 {
  margin: 0;
  font-weight: 200;
  font-size: 1.2rem;
  letter-spacing: 0.2rem;
  color: rgba(255, 255, 255, 0.9);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.clear-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.clear-btn:hover {
  background: rgba(255, 85, 85, 0.1);
  color: #ff5555;
  border-color: #ff5555;
}

.close-icon {
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  opacity: 0.5;
}

.playlist-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-container {
  padding: 0 1.2rem 1rem 1.2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.search-bar {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.6rem 1rem;
  padding-right: 2.5rem;
  border-radius: 8px;
  color: white;
  font-size: 0.85rem;
  outline: none;
  transition: all 0.3s;
}

.search-input:focus {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(0, 255, 255, 0.3);
}

.search-clear {
  position: absolute;
  right: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

.track-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.track-item {
  padding: 0.8rem 1.2rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  gap: 0.8rem;
  border-left: 2px solid transparent;
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
  font-size: 0.75rem;
  width: 20px;
  flex-shrink: 0;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.8);
}

.edit-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #00ffff;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  outline: none;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.action-btn {
  background: none;
  border: none;
  color: white;
  font-size: 0.85rem;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
  padding: 4px;
}

.track-item:hover .action-btn {
  opacity: 0.4;
}

.action-btn:hover {
  opacity: 1 !important;
  color: #00ffff;
}

.action-btn.remove:hover {
  color: #ff5555;
}

.playing-indicator {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
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
 bitumen
