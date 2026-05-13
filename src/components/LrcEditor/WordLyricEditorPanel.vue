<script setup lang="ts">
import { ref, watch } from 'vue';
import { db } from '@/utils/db';
import { showConfirm } from '@/components/common/ConfirmDialog';
import { asrService } from '@/utils/asr/asr';
import { parseNeteaseLrc, mergeLyrics } from '@/utils/asr/praseAsr';
import WordLyricEditor from './WordLyricEditor.vue';
import type { MusicRecord } from '@/utils/db';

const props = defineProps<{
  track: MusicRecord | null;
  audio: any;
  lineLrc: string; // 用于对齐的逐行歌词
  isCorrectTrack: boolean; // 新增：当前是否是正确音轨
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

// 循环播放停止函数
let loopStop: (() => void) | null = null;

// 开始录制 + 启动区间循环播放
const startRecord = async (lineIdx: number) => {
  stopRecord()
  const line = asrJson.value?.utterances?.[lineIdx];
  if (!line) return;

  // 1. 播放状态与音轨一致性校验
  if (!props.isCorrectTrack) {
    const ok = await showConfirm({
      title: '播放提示',
      content: '当前未播放此歌曲，是否立即开始播放并开始录制？'
    });
    
    if (ok && props.track) {
      const idx = props.audio.playlist.value.findIndex((t: any) => t.id === props.track?.id);
      if (idx !== -1) {
        props.audio.playTrack(idx);
        // 关键：切换歌曲后需要给一点时间让音频加载，否则 seek 会失效
        // 也可以等待 isCorrectTrack 变为 true 的 watch，但这里用延时比较简单直接
        await new Promise(r => setTimeout(r, 500)); 
      } else {
        return;
      }
    } else {
      return;
    }
  }

  // 停止上一次的循环
  if (loopStop) { loopStop(); loopStop = null; }

  recordingLineIdx.value = lineIdx;
  recordingWordIdx.value = 0;
  recordingMarks.value = [];

  // 跳转到行首并开始播放
  props.audio.seek(line.start_time / 1000);
  if (props.audio.isPaused?.value) {
    props.audio.togglePlay();
  }

  // 监听播放时间，超出行尾就循环回行首
  loopStop = watch(
    () => props.audio.currentTime.value,
    (currentSec: number) => {
      const currentMs = currentSec * 1000;
      if (currentMs >= line.end_time) {
        props.audio.seek(line.start_time / 1000);
      }
    }
  );
};

// 退出录制时停止循环
const stopRecord = () => {
  if (loopStop) { loopStop(); loopStop = null; }
  recordingLineIdx.value = -1;
};

// 工具栏打点触发
const handleSidebarTap = () => {
  if (recordingLineIdx.value === -1) return;

  const currentLine = asrJson.value?.utterances?.[recordingLineIdx.value];
  if (!currentLine) return;

  // 打点时间保留整数 (ms)
  recordingMarks.value.push(Math.round(props.audio.currentTime.value * 1000));
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
    stopRecord(); // 录制完成，停止循环
  }
};

// AI 自动生成 (复用 Worker 逻辑)
const handleGenerateAsr = async () => {
  if (!props.track?.id) return;
  isFetching.value = true;

  try {
    // 直接从数据库查音频 Blob
    const record = await db.music.where("uid").equals(props.track.id).first();
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

// 导出分词文件 (直接导出 utterances 数组)
const handleExportJson = () => {
  if (!asrJson.value || !asrJson.value.utterances) {
    alert('当前没有可导出的分词数据');
    return;
  }
  const data = JSON.stringify(asrJson.value.utterances, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lyrics_${props.track?.name || 'export'}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// 验证导入的数据格式是否合法
const validateLrcJson = (data: any): boolean => {
  if (!Array.isArray(data)) return false;
  return data.every(line => {
    const hasBase = typeof line.start_time === 'number' && 
                    typeof line.end_time === 'number' && 
                    typeof line.transcript === 'string';
    
    if (!hasBase) return false;

    // 如果有分词数据，校验分词数组
    if (line.words) {
      if (!Array.isArray(line.words)) return false;
      return line.words.every((w: any) => 
        typeof w.start_time === 'number' && 
        typeof w.end_time === 'number' && 
        typeof w.label === 'string'
      );
    }
    return true;
  });
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
      
      let utterances = null;

      // 提取核心数组
      if (Array.isArray(parsed)) {
        utterances = parsed;
      } else if (parsed && parsed.utterances) {
        utterances = parsed.utterances;
      }

      // 字段校验
      if (utterances && validateLrcJson(utterances)) {
        asrJson.value = { utterances };
        alert('分词歌词导入成功');
      } else {
        throw new Error('数据结构不完整或格式错误');
      }
    } catch (err: any) {
      alert('导入失败: ' + err.message);
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
        <button class="btn-tap-large" @mousedown="handleSidebarTap">
          点击打点
        </button>

        <button class="btn-tool-action btn-secondary-tool" @click="stopRecord">
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

          <button
            v-if="asrJson"
            class="btn-tool-action btn-secondary-tool"
            style="margin-top: 10px;"
            @click="handleExportJson"
          >
            导出分词 JSON
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
