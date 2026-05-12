<script setup lang="ts">
import { ref } from 'vue';
import { db } from '@/utils/db';
import { asrService } from '@/utils/asr/asr';
import { parseNeteaseLrc, mergeLyrics } from '@/utils/asr/praseAsr';
import WordLyricEditor from './WordLyricEditor.vue';
import type { MusicRecord } from '@/utils/db';

const props = defineProps<{
  track: MusicRecord | null;
  audio: any;
  lineLrc: string; // 用于对齐的逐行歌词
}>();

const asrJson = defineModel<any>('asrJson', { default: undefined });

const isFetching = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const fetchMode = ref<'auto' | 'upload'>('auto');

// 录制状态
const recordingLineIdx = ref(-1);
const recordingWordIdx = ref(0);
const recordingMarks = ref<number[]>([]);

// 处理分词编辑器更新
const handleWordUpdate = (newUtterances: any[]) => {
  if (!asrJson.value) {
    asrJson.value = { utterances: [] };
  }
  asrJson.value = { ...asrJson.value, utterances: newUtterances };
};

// 开始录制
const startRecord = (lineIdx: number) => {
  recordingLineIdx.value = lineIdx;
  recordingWordIdx.value = 0;
  recordingMarks.value = [];

  const line = asrJson.value?.utterances?.[lineIdx];
  if (line) {
    props.audio.seek(line.start_time / 1000);
    if (props.audio.isPaused?.value) {
      props.audio.togglePlay();
    }
  }
};

// 工具栏打点触发
const handleSidebarTap = () => {
  if (recordingLineIdx.value === -1) return;

  const currentLine = asrJson.value?.utterances?.[recordingLineIdx.value];
  if (!currentLine) return;

  recordingMarks.value.push(props.audio.currentTime.value * 1000);
  recordingWordIdx.value++;

  if (recordingWordIdx.value >= currentLine.words.length) {
    const newUtterances = JSON.parse(JSON.stringify(asrJson.value.utterances));
    const line = newUtterances[recordingLineIdx.value];

    for (let i = 0; i < line.words.length; i++) {
      const start = recordingMarks.value[i];
      const end = recordingMarks.value[i + 1] || (start + 200);
      line.words[i].start_time = start;
      line.words[i].end_time = end;
    }

    asrJson.value = { ...asrJson.value, utterances: newUtterances };
    recordingLineIdx.value = -1;
  }
};

// AI 自动生成 (复用 Worker 逻辑)
const handleGenerateAsr = async () => {
  if (!props.track?.id) return;
  isFetching.value = true;

  try {
    // 直接从数据库查音频 Blob
    const record = await db.music.get(props.track.id);
    if (!record || !record.data) throw new Error('数据库中未找到音频数据');

    // 调用必剪 ASR
    const result = await asrService.transcribe(new Blob([record.data]));
    if (!result || !result.utterances) throw new Error('识别结果为空');

    // 使用 Worker 里的 mergeLyrics 逻辑进行对齐
    if (props.lineLrc && props.lineLrc.trim()) {
      console.log('[ASR] 正在复用 Worker 逻辑进行对齐融合...');
      const parsedLrc = parseNeteaseLrc(props.lineLrc);
      const finalUtterances = mergeLyrics(result.utterances, parsedLrc);
      asrJson.value = { utterances: finalUtterances };
    } else {
      console.log('[ASR] 无逐行歌词，直接使用识别结果');
      asrJson.value = result;
    }

    console.log('[ASR] 自动生成成功');
  } catch (err: any) {
    console.error('[ASR] 自动生成失败:', err);
    alert('自动生成失败: ' + err.message);
  } finally {
    isFetching.value = false;
  }
};

// 上传分词文件
const handleFileUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (res) => {
    try {
      const content = res.target?.result as string;
      const parsed = JSON.parse(content);
      asrJson.value = parsed;
    } catch {
      alert('文件格式错误，请上传有效的分词 JSON 文件');
    }
  };
  reader.readAsText(file);
};
</script>

<template>
  <div class="panel-layout">
    <!-- 编辑区 -->
    <div class="panel-editor">
      <WordLyricEditor
        v-if="asrJson"
        :utterances="asrJson.utterances"
        :current-time="audio.currentTime.value * 1000"
        :recording-line-idx="recordingLineIdx"
        :active-word-idx="recordingWordIdx"
        @update="handleWordUpdate"
        @start-record="startRecord"
      />
      <div v-else class="empty-placeholder">
        暂无分词数据，请点击右侧工具栏生成
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <!-- 录制控制台 -->
      <div v-if="recordingLineIdx !== -1" class="record-console">
        <div class="group-title">正在录制第 {{ recordingLineIdx + 1 }} 句</div>

        <div class="record-progress">
          进度: {{ recordingWordIdx }} / {{ asrJson?.utterances[recordingLineIdx]?.words.length }}
        </div>

        <div class="next-word-hint">
          下一个词: <span>{{ asrJson?.utterances[recordingLineIdx]?.words[recordingWordIdx]?.label || '完成' }}</span>
        </div>

        <button class="btn-tap-large" @mousedown="handleSidebarTap">
          点击打点
        </button>

        <p class="tool-info">跟着节奏点击上方大按钮记录时间点。</p>

        <button class="btn-tool-action btn-secondary-tool" @click="recordingLineIdx = -1">
          退出录制
        </button>
      </div>

      <!-- 常规工具栏 -->
      <template v-else>
        <div class="tool-group">
          <div class="group-title">获取模式</div>
          <div class="radio-options">
            <label class="radio-item">
              <input type="radio" v-model="fetchMode" value="auto">自动生成
            </label>
            <label class="radio-item">
              <input type="radio" v-model="fetchMode" value="upload"> 上传分词文件
            </label>
          </div>

          <button
            class="btn-tool-action"
            :disabled="isFetching"
            @click="fetchMode === 'upload' ? fileInputRef?.click() : handleGenerateAsr()"
          >
            <i v-if="isFetching" class="iconfont icon-loading"></i>
            {{ isFetching ? '正在处理...' : (fetchMode === 'upload' ? '选择本地文件' : '立即开始') }}
          </button>

          <input type="file" ref="fileInputRef" style="display: none" accept=".json" @change="handleFileUpload">
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.panel-layout {
  display: contents;
}

.panel-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.empty-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-style: italic;
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

.record-console { display: flex; flex-direction: column; gap: 1.5rem; }
.record-progress { font-size: 0.8rem; color: rgba(255, 255, 255, 0.4); font-family: monospace; }
.next-word-hint { font-size: 1.1rem; color: #fff; }
.next-word-hint span { color: #00ffff; font-weight: bold; text-shadow: 0 0 10px rgba(0, 255, 255, 0.3); }

.btn-tap-large {
  width: 100%;
  height: 120px;
  background: rgba(0, 255, 255, 0.1);
  border: 2px dashed rgba(0, 255, 255, 0.3);
  border-radius: 12px;
  color: #00ffff;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-tap-large:active {
  background: rgba(0, 255, 255, 0.2);
  transform: scale(0.98);
  border-style: solid;
}

.tool-info { font-size: 0.75rem; color: rgba(255, 255, 255, 0.25); line-height: 1.6; }
</style>
