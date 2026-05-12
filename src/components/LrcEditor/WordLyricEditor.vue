<script setup lang="ts">
import { ref, watch } from 'vue';
import type { UtteranceRecord, WordRecord } from '@/types/music';

const props = defineProps<{
  utterances: UtteranceRecord[];
  currentTime: number; // ms
  recordingLineIdx: number;
  activeWordIdx: number;
}>();

const emit = defineEmits<{
  (e: 'update', val: UtteranceRecord[]): void;
  (e: 'start-record', idx: number): void;
  (e: 'select-word', lineIdx: number, wordIdx: number): void;
}>();

const containerRef = ref<HTMLElement | null>(null);

/**
 * 边界调整逻辑：增加当前词时长，减少下一个词时长
 * delta > 0: 向后推边界
 * delta < 0: 向前拉边界
 */
const adjustBoundary = (lineIdx: number, wordIdx: number, delta: number) => {
  const newUtterances = JSON.parse(JSON.stringify(props.utterances));
  const words = newUtterances[lineIdx].words;
  const word = words[wordIdx];
  const nextWord = words[wordIdx + 1];

  if (delta > 0) {
    // 增加当前词，减少下一个词
    if (nextWord && (nextWord.end_time - nextWord.start_time) > delta) {
      word.end_time += delta;
      nextWord.start_time += delta;
    } else if (!nextWord) {
      // 最后一个词，直接增加
      word.end_time += delta;
    }
  } else {
    // 减少当前词，增加下一个词
    if ((word.end_time - word.start_time) > Math.abs(delta)) {
      word.end_time += delta;
      if (nextWord) {
        nextWord.start_time += delta;
      }
    }
  }
  
  // 更新整行结束时间
  newUtterances[lineIdx].end_time = words[words.length - 1].end_time;
  emit('update', newUtterances);
};

// 添加新词
const addWord = (lineIdx: number) => {
  const newUtterances = JSON.parse(JSON.stringify(props.utterances));
  const line = newUtterances[lineIdx];
  const lastWord = line.words[line.words.length - 1];
  const startTime = lastWord ? lastWord.end_time : line.start_time;
  
  line.words.push({
    start_time: startTime,
    end_time: startTime,
    label: '新词'
  });
  
  emit('update', newUtterances);
};

// 删除词：时间归还给前一个词（若无前词则归还给后一个词）
const deleteWord = (lineIdx: number, wordIdx: number) => {
  const newUtterances = JSON.parse(JSON.stringify(props.utterances));
  const words = newUtterances[lineIdx].words;
  
  if (words.length <= 1) return; // 至少保留一个词
  
  const removed = words[wordIdx];
  
  if (wordIdx > 0) {
    // 前一个词吞并被删词的时间
    words[wordIdx - 1].end_time = removed.end_time;
  } else if (words.length > 1) {
    // 无前词，后一个词继承起始时间
    words[1].start_time = removed.start_time;
  }
  
  words.splice(wordIdx, 1);
  newUtterances[lineIdx].end_time = words[words.length - 1].end_time;
  emit('update', newUtterances);
};

// 判定高亮
const isLineActive = (line: UtteranceRecord) => props.currentTime >= line.start_time && props.currentTime < line.end_time;
const isWordActive = (word: WordRecord) => props.currentTime >= word.start_time && props.currentTime < word.end_time;

watch(() => props.currentTime, (time) => {
  if (props.recordingLineIdx !== -1) return;
  const activeIdx = props.utterances.findIndex(u => time >= u.start_time && time < u.end_time);
  if (activeIdx !== -1 && containerRef.value) {
    const activeEl = containerRef.value.querySelector(`.line-section.active`);
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
</script>

<template>
  <div class="word-flow-editor" ref="containerRef">
    <div 
      v-for="(line, lIdx) in utterances" 
      :key="lIdx"
      :class="['line-section', { active: isLineActive(line), recording: recordingLineIdx === lIdx }]"
    >
      <div class="line-header">
        <button 
          :class="['btn-rec', { active: recordingLineIdx === lIdx }]" 
          @click="emit('start-record', lIdx)"
        >
          <i class="iconfont icon-record"></i>
        </button>
        <span class="line-time">{{ (line.start_time / 1000).toFixed(2) }}s</span>
        <div class="line-sep"></div>
        <span class="line-text-preview">{{ line.transcript }}</span>
      </div>

      <div class="words-wrapper">
        <div 
          v-for="(word, wIdx) in line.words" 
          :key="wIdx"
          :class="['word-chip', { 
            active: isWordActive(word), 
            recording: recordingLineIdx === lIdx && wIdx === activeWordIdx,
            pending: recordingLineIdx === lIdx && wIdx > activeWordIdx
          }]"
          @click="emit('select-word', lIdx, wIdx)"
        >
          <input 
            v-model="word.label" 
            class="word-input" 
            :style="{ width: (word.label.length || 1) + 'em' }" 
            @change="emit('update', utterances)"
          >
          
          <!-- 表单式上下箭头微调 -->
          <div class="stepper-wrap">
            <button class="step-up" @click.stop="adjustBoundary(lIdx, wIdx, 20)">
              <i class="iconfont icon-shangjiantou"></i>
            </button>
            <button class="step-down" @click.stop="adjustBoundary(lIdx, wIdx, -20)">
              <i class="iconfont icon-xiajiantou"></i>
            </button>
          </div>

          <div class="word-duration-label">{{ word.end_time - word.start_time }}ms</div>

          <!-- 删除按钮：hover 时显示 -->
          <button class="btn-delete-word" @click.stop="deleteWord(lIdx, wIdx)" title="删除此词">
            <i class="iconfont icon-guanbi_o"></i>
          </button>

          <div class="word-glow" v-if="isWordActive(word)"></div>
        </div>

        <!-- 末尾加词按钮 -->
        <button class="chip-add-btn" @click="addWord(lIdx)" title="在该行末尾添加词">
          <i class="iconfont icon-jiahao_o"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.word-flow-editor {
  height: 100%; overflow-y: auto; padding: 20px;
  background: rgba(0, 0, 0, 0.2); display: flex; flex-direction: column; gap: 15px;
}

.line-section {
  padding: 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05); transition: all 0.3s;
}
.line-section.active { border-color: rgba(0, 255, 255, 0.2); background: rgba(0, 255, 255, 0.04); }
.line-section.recording { border-color: #ff4444; }

.line-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.line-text-preview { font-size: 0.75rem; color: rgba(255, 255, 255, 0.2); font-style: italic; }

.btn-rec {
  width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent; color: rgba(255, 255, 255, 0.4); cursor: pointer;
}
.btn-rec.active { background: #ff4444; color: #fff; border-color: #ff4444; }

.line-time { font-size: 10px; color: #00ffff; opacity: 0.5; font-family: monospace; }
.line-sep { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), transparent); }

.words-wrapper { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

/* 词块磁贴 */
.word-chip {
  display: inline-flex; align-items: center;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 2px 8px; border-radius: 6px; position: relative; gap: 5px;
}
.word-chip.active { border-color: #00ffff; background: rgba(0, 255, 255, 0.1); }
.word-chip.pending { opacity: 0.3; }

.word-input {
  background: transparent; border: none; color: white;
  font-size: 0.9rem; font-weight: 500; outline: none; padding: 0;
}

/* 上下箭头微调器 */
.stepper-wrap {
  display: flex; flex-direction: column; width: 14px;
}
.step-up, .step-down {
  background: none; border: none; color: rgba(255, 255, 255, 0.2);
  padding: 0; height: 10px; cursor: pointer; line-height: 1; display: flex; align-items: center;
}
.step-up:hover, .step-down:hover { color: #00ffff; }
.step-up i, .step-down i { font-size: 12px; }

.word-duration-label {
  font-size: 9px; color: rgba(255, 255, 255, 0.2); font-family: monospace;
  margin-left: 4px; border-left: 1px solid rgba(255, 255, 255, 0.1); padding-left: 6px;
}

/* 删除词按钮 */
.btn-delete-word {
  display: none; /* 默认隐藏 */
  background: none; border: none;
  color: rgba(255, 80, 80, 0.6); cursor: pointer; padding: 0;
  font-size: 10px; line-height: 1; align-items: center;
  margin-left: 2px;
}
.btn-delete-word i { font-size: 10px; }
.btn-delete-word:hover { color: #ff4444; }

/* 词块 hover 时显示删除按钮 */
.word-chip:hover .btn-delete-word { display: flex; }

/* 末尾加词按钮 */
.chip-add-btn {
  width: 28px; height: 28px; border-radius: 6px;
  background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.3); cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.chip-add-btn:hover { background: rgba(0, 255, 255, 0.1); border-color: #00ffff; color: #00ffff; }

.word-glow {
  position: absolute; bottom: 0; left: 0; width: 100%; height: 2px;
  background: #00ffff; box-shadow: 0 0 10px #00ffff;
}

.word-flow-editor::-webkit-scrollbar { width: 4px; }
.word-flow-editor::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
</style>
