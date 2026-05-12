<script setup lang="ts">
import { ref } from 'vue';
import { extractMusicInfo, searchAndGetBestMatchId, fetchLyricById } from '@/utils/ai';
import { showConfirm } from '@/components/common/ConfirmDialog';
import type { MusicRecord } from '@/utils/db';

const props = defineProps<{
  track: MusicRecord | null;
  audio: any;
  isCorrectTrack: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:lineLrc', val: string): void;
}>();

const lineLrc = defineModel<string>('lineLrc', { default: '' });

const isFetching = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const fetchMode = ref<'auto' | 'manual' | 'upload'>('auto');
const manualId = ref('');

// 提取 ID 逻辑
const extractId = (input: string) => {
  const paramMatch = input.match(/[?&]id=(\d+)/);
  if (paramMatch) return paramMatch[1];
  const pureMatch = input.match(/(\d{6,})/);
  return pureMatch ? pureMatch[1] : (input.match(/^\d+$/) ? input : '');
};

const handleFetchLyrics = async () => {
  if (!props.track) return;
  isFetching.value = true;
  try {
    let targetId = '';

    if (fetchMode.value === 'manual') {
      targetId = extractId(manualId.value);
      if (!targetId) {
        alert('请输入有效的网易云歌曲 ID 或链接');
        return;
      }
    } else {
      const info = await extractMusicInfo(props.track.name, true);
      if (!info || (!info.name && !info.artist)) return;

      targetId = await searchAndGetBestMatchId(info.name || '', info.artist || '', true) || '';

      if (targetId) {
        manualId.value = targetId;
      } else {
        return;
      }
    }

    const lyric = await fetchLyricById(targetId);
    if (lyric) {
      lineLrc.value = lyric;
    } else {
      alert('该歌曲暂无歌词数据');
    }
  } catch (err) {
    console.error('获取歌词失败:', err);
  } finally {
    isFetching.value = false;
  }
};

const logCurrentLine = async () => {
  if (!props.isCorrectTrack || !props.audio.isPlaying.value) {
    const ok = await showConfirm({
      title: '播放提示',
      content: '当前未播放此歌曲，是否立即开始播放并标记？'
    });
    if (ok && props.track) {
      const idx = props.audio.playlist.value.findIndex((t: any) => t.id === props.track?.id);
      if (idx !== -1) props.audio.playTrack(idx);
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

  const text = lineLrc.value;
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

  const lineContent = lines[targetLineIdx];
  const timestampRegex = /^\[\d{1,2}:\d{1,2}(?:\.\d+)?\]/;
  if (timestampRegex.test(lineContent)) {
    lines[targetLineIdx] = lineContent.replace(timestampRegex, timeStr);
  } else {
    lines[targetLineIdx] = timeStr + lineContent;
  }

  const oldScrollTop = el.scrollTop;
  lineLrc.value = lines.join('\n');

  await new Promise(r => setTimeout(r, 0)); // nextTick

  let nextPos = 0;
  for (let i = 0; i <= targetLineIdx; i++) {
    nextPos += lines[i].length + 1;
  }
  nextPos = Math.min(nextPos, lineLrc.value.length);
  el.setSelectionRange(nextPos, nextPos);
  el.focus({ preventScroll: true });

  const lineHeight = 32;
  const visibleLines = Math.floor(el.clientHeight / lineHeight);
  const cursorLine = targetLineIdx + 1;
  const currentScrollLine = Math.floor(oldScrollTop / lineHeight);
  if (cursorLine >= currentScrollLine + visibleLines - 1) {
    el.scrollTop = (cursorLine - visibleLines + 2) * lineHeight;
  } else {
    el.scrollTop = oldScrollTop;
  }
};

const handleFileUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (res) => {
    const content = res.target?.result as string;
    if (content) lineLrc.value = content;
  };
  reader.readAsText(file);
};

const handleExportLrc = () => {
  if (!lineLrc.value) {
    alert('当前没有歌词可导出');
    return;
  }
  const blob = new Blob([lineLrc.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.track?.name || 'lyrics'}.lrc`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="panel-layout">
    <!-- 编辑区 -->
    <div class="panel-editor">
      <textarea
        ref="textareaRef"
        v-model="lineLrc"
        placeholder="在此输入或粘贴 LRC 格式歌词..."
        class="lyric-textarea"
      ></textarea>
    </div>

    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <div class="tool-group">
        <div class="group-title">获取模式</div>
        <div class="radio-options">
          <label class="radio-item">
            <input type="radio" v-model="fetchMode" value="auto"> 智能匹配 (AI)
          </label>
          <label class="radio-item">
            <input type="radio" v-model="fetchMode" value="manual"> 网易云 ID
          </label>
          <label class="radio-item">
            <input type="radio" v-model="fetchMode" value="upload"> 本地文件
          </label>
        </div>

        <div v-if="fetchMode === 'manual'" class="id-input-wrap">
          <input v-model="manualId" placeholder="输入 ID 或链接" class="tool-input">
        </div>

        <button
          class="btn-tool-action"
          :disabled="isFetching"
          @click="fetchMode === 'upload' ? fileInputRef?.click() : handleFetchLyrics()"
        >
          <i v-if="isFetching" class="iconfont icon-loading"></i>
          {{ isFetching ? '正在处理...' : (fetchMode === 'upload' ? '选择本地文件' : '立即开始') }}
        </button>

        <input type="file" ref="fileInputRef" style="display: none" accept=".lrc,.txt" @change="handleFileUpload">
      </div>

      <div class="divider"></div>

      <div class="tool-group">
        <div class="group-title">快捷工具</div>
        <button class="btn-tool-action btn-secondary-tool" @click="logCurrentLine" style="margin-bottom: 0.8rem">
          <i class="iconfont icon-shijian"></i> 标记当前光标行
        </button>
        <button class="btn-tool-action btn-secondary-tool" @click="handleExportLrc">
          <i class="iconfont icon-export"></i> 导出 LRC 文件
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-layout {
  display: contents; /* 透明容器，不影响父级 flex 布局 */
}

.panel-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.lyric-textarea {
  flex: 1;
  width: 100%;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.95rem;
  line-height: 2;
  resize: none;
  outline: none;
}

.panel-toolbar {
  width: 280px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  background: rgba(0, 0, 0, 0.2);
  overflow-y: auto;
  padding-right: 12px;
}

.panel-toolbar::-webkit-scrollbar { width: 4px; }
.panel-toolbar::-webkit-scrollbar-track { background: transparent; }
.panel-toolbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }
.panel-toolbar::-webkit-scrollbar-thumb:hover { background: rgba(0, 255, 255, 0.3); }

.group-title {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  margin-bottom: 1rem;
  letter-spacing: 1px;
}

.radio-options { display: flex; flex-direction: column; gap: 0.8rem; }
.radio-item { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 0.85rem; }

.id-input-wrap { margin-top: 1rem; }
.tool-input {
  width: 80%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.6rem;
  border-radius: 6px;
  color: white;
  font-size: 0.8rem;
  outline: none;
}

.btn-tool-action {
  width: 100%;
  margin-top: 1.2rem;
  padding: 0.6rem;
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
  color: #00ffff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.85rem;
}
.btn-tool-action:hover:not(:disabled) { background: rgba(0, 255, 255, 0.2); }

.btn-secondary-tool {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.6);
}
.btn-secondary-tool:hover { background: rgba(255, 255, 255, 0.1); }

.divider { height: 1px; background: rgba(255, 255, 255, 0.05); margin: 1.5rem 0; }
</style>
