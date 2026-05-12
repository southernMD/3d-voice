<script setup lang="ts">
import { ref, watch, reactive, nextTick, computed } from 'vue';
import { db } from '@/utils/db';
import type { MusicRecord } from '@/utils/db';
import { extractMusicInfo, searchAndGetBestMatchId, fetchLyricById } from '@/utils/ai';
import { showConfirm } from '@/components/common/ConfirmDialog';

const props = defineProps<{
  visible: boolean;
  track: MusicRecord | null;
  audio: any; // AudioSystem
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', trackId: string, updatedTrack: any): void;
}>();

const activeTab = ref('line'); // 'line' | 'word'
const isSaving = ref(false);
const isFetching = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 编辑状态
const state = reactive({
  noLyrics: false,
  lineLrc: '',
  fetchMode: 'auto', // 'auto' | 'manual'
  manualId: ''
});

const isCorrectTrack = computed(() => {
  const currentTrack = props.audio.playlist.value[props.audio.currentIndex.value];
  return currentTrack && currentTrack.id === props.track?.id;
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
      if (idx !== -1) {
        props.audio.playTrack(idx);
      }
    }
  }
};

// 初始化数据 (根据 UID 读取最新的)
watch(() => props.visible, async (val) => {
  if (val && props.track?.id) {
    // 强制转为 any 以匹配数据库中的 uid 字符串
    const latestTrack = await db.music.where('uid').equals(props.track.id as any).first();
    if (latestTrack) {
      state.noLyrics = latestTrack.noLyrics || false;
      state.lineLrc = latestTrack.lineLrc || '';
      state.manualId = latestTrack.neteaseId || '';
      activeTab.value = 'line';
    }
  }
});

// 提取 ID 逻辑 (优化正则，防止匹配到域名里的 163)
const extractId = (input: string) => {
  // 1. 优先匹配 URL 参数中的 id=数字
  const paramMatch = input.match(/[?&]id=(\d+)/);
  if (paramMatch) return paramMatch[1];
  
  // 2. 如果是纯数字，或者末尾是长数字
  const pureMatch = input.match(/(\d{6,})/);
  return pureMatch ? pureMatch[1] : (input.match(/^\d+$/) ? input : '');
};

// 复用满血版获取歌词逻辑
const handleFetchLyrics = async () => {
  if (!props.track) return;
  isFetching.value = true;
  try {
    let targetId = '';
    
    if (state.fetchMode === 'manual') {
      targetId = extractId(state.manualId);
      if (!targetId) {
        alert('请输入有效的网易云歌曲 ID 或链接');
        return;
      }
    } else {
      // 1. AI 语义解析 (包含名称微调弹窗)
      const info = await extractMusicInfo(props.track.name, true);
      if (!info || (!info.name && !info.artist)) return;

      // 2. 网易云搜索与相似度匹配 (包含歌曲选择弹窗)
      targetId = await searchAndGetBestMatchId(info.name || '', info.artist || '', true) || '';
      
      if (targetId) {
        state.manualId = targetId; // 反向填入 ID 框
      } else {
        return; // 用户取消或未找到
      }
    }
    
    // 3. 根据确定的 ID 获取歌词文本
    const lyric = await fetchLyricById(targetId);
    
    if (lyric) {
      state.lineLrc = lyric;
      state.noLyrics = false;
    } else {
      alert('该歌曲暂无歌词数据');
    }
  } catch (err) {
    console.error('获取歌词失败:', err);
  } finally {
    isFetching.value = false;
  }
};

// 核心逻辑：获取光标所在行的行号和内容
const logCurrentLine = async () => {
  // 1. 播放状态校验
  if (!isCorrectTrack.value || !props.audio.isPlaying.value) {
    const ok = await showConfirm({
      title: '播放提示',
      content: '当前未播放此歌曲，是否立即开始播放并标记？'
    });
    
    if (ok && props.track) {
      const idx = props.audio.playlist.value.findIndex((t: any) => t.id === props.track?.id);
      if (idx !== -1) {
        props.audio.playTrack(idx);
      }
    }
    return;
  }

  const el = textareaRef.value;
  if (!el) return;

  const time = props.audio.currentTime.value;
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 1000);
  const timeStr = `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}]`;

  const text = state.lineLrc;
  const pos = el.selectionStart;
  const lines = text.split('\n');
  
  let currentPos = 0;
  let targetLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1;
    if (pos >= currentPos && pos < currentPos + lineLen) {
      targetLineIdx = i;
      break;
    }
    currentPos += lineLen;
  }

  if (targetLineIdx === -1) targetLineIdx = lines.length - 1;

  // 替换或添加时间戳
  const lineContent = lines[targetLineIdx];
  const timestampRegex = /^\[\d{1,2}:\d{1,2}(?:\.\d+)?\]/;
  
  if (timestampRegex.test(lineContent)) {
    lines[targetLineIdx] = lineContent.replace(timestampRegex, timeStr);
  } else {
    lines[targetLineIdx] = timeStr + lineContent;
  }

  const oldScrollTop = el.scrollTop;
  state.lineLrc = lines.join('\n');

  // 自动跳转到下一行
  await nextTick();
  
  // 计算下一行位置
  let nextPos = 0;
  for (let i = 0; i <= targetLineIdx; i++) {
    nextPos += lines[i].length + 1;
  }
  // 确保不越界
  nextPos = Math.min(nextPos, state.lineLrc.length);

  // 关键：先设置光标，再进行静默聚焦
  el.setSelectionRange(nextPos, nextPos);
  el.focus({ preventScroll: true }); 

  // 手动计算是否需要滚动 (简单的行高估算法)
  const lineHeight = 32; // 对应 CSS 中的 line-height: 2 (0.95rem * 2 * 16px ≈ 30-32px)
  const visibleLines = Math.floor(el.clientHeight / lineHeight);
  const cursorLine = targetLineIdx + 1;
  const currentScrollLine = Math.floor(oldScrollTop / lineHeight);

  // 如果光标即将超出可视范围（下方），则滚动一行
  if (cursorLine >= currentScrollLine + visibleLines - 1) {
    el.scrollTop = (cursorLine - visibleLines + 2) * lineHeight;
  } else {
    // 否则，坚决保持原位，不许乱跳
    el.scrollTop = oldScrollTop;
  }
};

const handleFileUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (res) => {
    const content = res.target?.result as string;
    if (content) {
      state.lineLrc = content;
      state.noLyrics = false;
    }
  };
  reader.readAsText(file);
};

const handleExportLrc = () => {
  if (!state.lineLrc) {
    alert('当前没有歌词可导出');
    return;
  }
  const blob = new Blob([state.lineLrc], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.track?.name || 'lyrics'}.lrc`;
  a.click();
  URL.revokeObjectURL(url);
};

// 格式化秒数为 mm:ss
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const handleSeek = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  props.audio.seek(parseFloat(val));
};

const handleSave = async () => {
  if (!props.track || !props.track.id) return;
  isSaving.value = true;
  try {
    const updateData: Partial<MusicRecord> = {
      noLyrics: state.noLyrics,
      lineLrc: state.lineLrc,
      neteaseId: state.fetchMode === 'manual' ? extractId(state.manualId) : props.track.neteaseId
    };

    // 如果标记为无歌词，清空相关 JSON
    if (state.noLyrics) {
      updateData.lrcJson = [];
      updateData.asrJson = undefined;
    }

    console.log('[LyricEditor] 正在尝试更新数据库，UID:', props.track.id);
    console.log('[LyricEditor] 更新内容:', updateData);

    // 使用 uid 进行更新，强制转为 any 绕过类型检查
    const updatedCount = await db.music
      .where('uid')
      .equals(props.track.id as any)
      .modify(updateData);
    
    if (updatedCount > 0) {
      console.log('[LyricEditor] 数据库更新成功');
      emit('save', String(props.track.id), updateData);
      emit('close');
    } else {
      console.error('[LyricEditor] 数据库更新失败：未找到对应的 UID 记录。');
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
              <input type="checkbox" v-model="state.noLyrics">
              <span class="toggle-text">标记为无歌词</span>
            </label>
            <button class="close-btn" @click="emit('close')">
              <i class="iconfont icon-guanbi_o"></i>
            </button>
          </div>
        </div>

        <!-- 主体区域 -->
        <div class="modal-body" v-show="!state.noLyrics">
          <div class="main-editor">
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

            <!-- 编辑区内容 -->
            <div class="tab-content">
              <div v-if="activeTab === 'line'" class="line-editor">
                <textarea 
                  ref="textareaRef"
                  v-model="state.lineLrc" 
                  placeholder="在此输入或粘贴 LRC 格式歌词..."
                  class="lyric-textarea"
                ></textarea>
              </div>
              <div v-else class="word-editor">
                <div class="empty-placeholder">分词编辑功能开发中...</div>
              </div>
            </div>
          </div>

          <!-- 右侧工具栏 -->
          <div class="side-toolbar">
            <div class="tool-group" v-if="activeTab === 'line'">
              <div class="group-title">获取歌词</div>
              <div class="radio-options">
                <label class="radio-item">
                  <input type="radio" value="auto" v-model="state.fetchMode">
                  <span>自动匹配标题</span>
                </label>
                <label class="radio-item">
                  <input type="radio" value="manual" v-model="state.fetchMode">
                  <span>指定网易云 ID</span>
                </label>
                <label class="radio-item">
                  <input type="radio" value="upload" v-model="state.fetchMode">
                  <span>上传本地歌词</span>
                </label>
              </div>
              
              <div v-if="state.fetchMode === 'manual'" class="id-input-wrap">
                <input 
                  type="text" 
                  v-model="state.manualId" 
                  placeholder="输入 ID 或链接..." 
                  class="tool-input"
                >
              </div>

              <button 
                class="btn-tool-action" 
                :disabled="isFetching" 
                @click="state.fetchMode === 'upload' ? fileInputRef?.click() : handleFetchLyrics()"
              >
                <i v-if="state.fetchMode === 'upload'" class="iconfont icon-shangchuan" style="margin-right: 6px;"></i>
                {{ isFetching ? '获取中...' : (state.fetchMode === 'upload' ? '选择本地文件' : '立即获取') }}
              </button>

              <input 
                type="file" 
                ref="fileInputRef"
                hidden 
                accept=".lrc,.txt" 
                @change="handleFileUpload"
              >
            </div>

            <div class="tool-info">
              <div class="group-title">快捷工具</div>
              <button class="btn-tool-action btn-mark-side" @click="logCurrentLine">
                <i class="iconfont icon-shijian"></i>
                标记当前光标行
              </button>
              
              <button class="btn-tool-action btn-mark-side" style="margin-top: 0.5rem" @click="handleExportLrc">
                <i class="iconfont icon-download"></i>
                导出 LRC 文件
              </button>

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
  flex: 1; display: flex; overflow: hidden;
}

.main-editor {
  flex: 1; display: flex; flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.editor-tabs {
  display: flex; gap: 1px; background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem 1rem;
}

.tab-btn {
  background: none; border: none; color: rgba(255, 255, 255, 0.4);
  padding: 0.6rem 1.2rem; font-size: 0.85rem; cursor: pointer;
  transition: all 0.3s; border-radius: 6px;
}
.tab-btn.active { background: rgba(0, 255, 255, 0.1); color: #00ffff; }

.tab-content { flex: 1; padding: 1.5rem; overflow: hidden; }

.line-editor, .word-editor { height: 100%; display: flex; flex-direction: column; }

.editor-actions {
  padding-bottom: 1rem;
  display: flex;
  gap: 0.8rem;
}

.btn-mark {
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
  color: #00ffff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.3s;
}

.btn-mark:hover {
  background: rgba(0, 255, 255, 0.2);
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
}

.lyric-textarea {
  flex: 1; width: 100%; background: transparent;
  border: none; color: rgba(255, 255, 255, 0.8);
  font-family: 'JetBrains Mono', monospace; font-size: 0.95rem;
  line-height: 2; resize: none; outline: none;
}

.empty-placeholder {
  height: 100%; display: flex; align-items: center; justify-content: center;
  color: rgba(255, 255, 255, 0.2); font-style: italic;
}

.side-toolbar {
  width: 280px; padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem;
  background: rgba(0, 0, 0, 0.2);
}

.group-title {
  font-size: 0.75rem; color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 1px;
}

.radio-options { display: flex; flex-direction: column; gap: 0.8rem; }
.radio-item { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.85rem; }

.id-input-wrap { margin-top: 1rem; }
.tool-input {
  width: 100%; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.6rem; border-radius: 6px; color: white; font-size: 0.8rem; outline: none;
}

.btn-tool-action {
  width: 100%; margin-top: 1.2rem; padding: 0.6rem; background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3); color: #00ffff; border-radius: 6px;
  cursor: pointer; transition: all 0.3s; font-size: 0.85rem;
}
.btn-tool-action:hover:not(:disabled) { background: rgba(0, 255, 255, 0.2); }

.btn-secondary-tool {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.8rem;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.btn-secondary-tool:hover { background: rgba(255, 255, 255, 0.1); }

.divider { height: 1px; background: rgba(255, 255, 255, 0.05); margin: 1.5rem 0; }

.btn-mark-side {
  margin-top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tool-info { font-size: 0.75rem; color: rgba(255, 255, 255, 0.25); line-height: 1.6; }

.modal-footer {
  padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center;
  background: rgba(255, 255, 255, 0.02); border-top: 1px solid rgba(255, 255, 255, 0.05);
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
.player-btn i.icon-bofang { transform: translateX(1px); } /* 播放按钮视觉微调 */

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
