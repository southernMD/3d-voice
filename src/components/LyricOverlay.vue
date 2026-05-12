<script setup lang="ts">
import { computed } from 'vue';

interface Word {
  label: string;
  start_time: number;
  end_time: number;
}

interface Utterance {
  start_time: number;
  end_time: number;
  transcript: string;
  words?: Word[];
}

const props = defineProps<{
  lyrics: Utterance[] | null;
  currentTimeMs: number;
  activeLineIndex: number;
  emotionTag?: string;
}>();

const activeLine = computed(() => {
  if (!props.lyrics || props.activeLineIndex < 0 || props.activeLineIndex >= props.lyrics.length) {
    return null;
  }
  return props.lyrics[props.activeLineIndex];
});

const isWordActive = (word: Word) => {
  return props.currentTimeMs >= word.start_time && props.currentTimeMs <= word.end_time;
};

const isWordPast = (word: Word) => {
  return props.currentTimeMs > word.end_time;
};

const isWordFuture = (word: Word) => {
  return props.currentTimeMs < word.start_time;
};

const getAnimationType = (lineIdx: number, wordIdx: number) => {
  return ((lineIdx * 7 + wordIdx * 13) % 5) + 1;
};
</script>

<template>
  <div class="lyric-overlay">
    <!-- 使用单个容器，通过内容变化来切换，减少 DOM 节点的销毁/重建 -->
    <div 
      class="lyric-line-wrapper"
      :key="activeLineIndex"
    >
      <div 
        v-if="activeLine"
        class="lyric-line active"
      >
        <template v-if="activeLine.words && activeLine.words.length > 0">
          <span 
            v-for="(word, wIdx) in activeLine.words" 
            :key="`w-${activeLineIndex}-${wIdx}`"
            :class="['word', { 
              'word-active': isWordActive(word), 
              'word-past': isWordPast(word),
              'word-future': isWordFuture(word),
              [`passionate-anim-${getAnimationType(activeLineIndex, wIdx)}`]: emotionTag === 'Passionate' && isWordActive(word),
              [`calm-anim-${getAnimationType(activeLineIndex, wIdx)}`]: emotionTag === 'Calm' && isWordActive(word),
              [`melancholy-anim-${getAnimationType(activeLineIndex, wIdx)}`]: emotionTag === 'Melancholy' && isWordActive(word),
              [`desperate-anim-${getAnimationType(activeLineIndex, wIdx)}`]: emotionTag === 'Desperate' && isWordActive(word)
            }]"
          >
            {{ word.label }}
          </span>
        </template>
        <template v-else>
          <span class="word word-active">{{ activeLine.transcript }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyric-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
  box-sizing: border-box;
}

.lyric-line-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

.lyric-line {
  font-family: 'Inter', 'Noto Sans SC', sans-serif;
  text-align: center;
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  white-space: pre-wrap;
  max-width: 90%;
  line-height: 1.4;
  
  /* 节奏层：长音拉伸效果 */
  letter-spacing: calc(var(--lyric-stretch, 0) * 2px);
}

.lyric-line.active {
  color: var(--lyric-color, #ffffff);
  font-size: 3.2rem;
  font-weight: 900;
  text-shadow: 
    0 0 10px rgba(0, 0, 0, 0.8),
    0 0 calc(20px + var(--lyric-stretch, 0) * 10px) var(--lyric-color), /* 长音时阴影扩散 */
    0 10px 30px rgba(0, 0, 0, 0.5);
  -webkit-text-stroke: 1px rgba(0, 0, 0, 0.5);
  transform: scale(var(--lyric-scale, 1));
  opacity: var(--lyric-opacity, 1);
  z-index: 100;
  animation: lyric-shake 0.1s infinite alternate;
}

@keyframes lyric-shake {
  from { transform: scale(var(--lyric-scale, 1)) translate(0, 0); }
  to { transform: scale(var(--lyric-scale, 1)) translate(var(--lyric-shake, 0px), var(--lyric-shake, 0px)); }
}

.word {
  display: inline-block;
  margin: 0 0.2rem;
  /* 动态调整入场速度：节奏越快，动画越快 */
  transition: all calc(0.3s / var(--lyric-rhythm-weight, 1)) cubic-bezier(0.175, 0.885, 0.32, 1.275);
  color: var(--lyric-color); /* 基础色随情感变化 */
  opacity: 0; /* 完全隐藏未播放歌词 */
  transform: translateY(10px) scale(0.8);
  filter: saturate(0.5) brightness(1.2);
}

.word-active {
  color: #ffffff; /* 激活时变为纯白 */
  /* 辉光效果 (Bloom) */
  filter: 
    brightness(var(--lyric-brightness, 1.5)) 
    drop-shadow(0 0 8px var(--lyric-color))
    drop-shadow(0 0 15px var(--lyric-color));
  
  transform: translateY(-10px) scale(1.08);
  opacity: 1;
}

.word-past {
  opacity: 0.6;
  transform: translateY(0) scale(1);
  filter: grayscale(0.3) brightness(1); 
  color: var(--lyric-color);
}

/* 未来单词完全不可见 */
.word-future {
  opacity: 0;
  color: var(--lyric-color);
}

/* 激情状态下的动画 (保持不变) */
.passionate-anim-1 { animation: passion-jump-left 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
@keyframes passion-jump-left {
  0% { transform: translate(-100px, 0) rotate(-360deg); opacity: 0; }
  100% { transform: translate(0, -10px) rotate(0); opacity: 1; }
}
.passionate-anim-2 { animation: passion-rotate-top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
@keyframes passion-rotate-top {
  0% { transform: translateY(-50px) rotateX(90deg); opacity: 0; }
  100% { transform: translateY(-10px) rotateX(0); opacity: 1; }
}
.passionate-anim-3 { animation: passion-rotate-bottom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
@keyframes passion-rotate-bottom {
  0% { transform: translateY(50px) rotateX(-90deg); opacity: 0; }
  100% { transform: translateY(-10px) rotateX(0); opacity: 1; }
}
.passionate-anim-4 { animation: passion-explosive 0.3s ease-out forwards; }
@keyframes passion-explosive {
  0% { transform: scale(1.8); filter: brightness(3); opacity: 0; }
  70% { transform: scale(0.9); filter: brightness(1.5); opacity: 1; }
  100% { transform: scale(1.08) translateY(-10px); filter: brightness(1); opacity: 1; }
}
.passionate-anim-5 { animation: passion-z-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
@keyframes passion-z-pop {
  0% { transform: translateZ(-500px) scale(0); filter: blur(20px); opacity: 0; }
  100% { transform: translateZ(0) scale(1.15) translateY(-10px); filter: blur(0); opacity: 1; }
}

/* ================= 平静状态下的 5 种随机动画 ================= */

/* 1. 轻盈漂浮 */
.calm-anim-1 {
  animation: calm-float-up 0.8s ease-out forwards;
}
@keyframes calm-float-up {
  0% { transform: translateY(20px); opacity: 0; }
  100% { transform: translateY(-10px) scale(1.08); opacity: 1; }
}

/* 2. 呼吸扩张 */
.calm-anim-2 {
  animation: calm-expand 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes calm-expand {
  0% { letter-spacing: 1rem; opacity: 0; transform: scale(0.9); }
  100% { letter-spacing: 0.2rem; opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 3. 薄雾显现 */
.calm-anim-3 {
  animation: calm-mist 1.2s ease-in-out forwards;
}
@keyframes calm-mist {
  0% { filter: blur(15px); opacity: 0; transform: scale(1.1); }
  100% { filter: blur(0); opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 4. 水波摇曳 */
.calm-anim-4 {
  animation: calm-sway 1.5s ease-in-out forwards;
}
@keyframes calm-sway {
  0% { transform: translateX(-10px) rotate(-2deg); opacity: 0; }
  50% { transform: translateX(5px) rotate(1deg); }
  100% { transform: translateX(0) rotate(0) translateY(-10px) scale(1.08); opacity: 1; }
}

/* 5. 深处聚焦 */
.calm-anim-5 {
  animation: calm-focus 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes calm-focus {
  0% { transform: scale(0.5) translateZ(-100px); opacity: 0; filter: brightness(0.5); }
  100% { transform: scale(1.08) translateZ(0) translateY(-10px); opacity: 1; filter: brightness(1); }
}

/* ================= 失落状态下的 5 种“凄美”动画 ================= */

/* 1. 泪滴化开 */
.melancholy-anim-1 {
  animation: melancholy-tear 1.2s cubic-bezier(0.2, 0, 0.2, 1) forwards;
}
@keyframes melancholy-tear {
  0% { transform: translateY(-50px) scaleY(2) scaleX(0.5); opacity: 0; filter: blur(5px); }
  60% { transform: translateY(5px) scaleY(0.7) scaleX(1.3); opacity: 0.8; }
  100% { transform: translateY(-10px) scale(1.08); opacity: 1; filter: blur(0); }
}

/* 2. 灵魂回声 */
.melancholy-anim-2 {
  animation: melancholy-echo 1.5s ease-out forwards;
}
@keyframes melancholy-echo {
  0% { text-shadow: -20px 0 20px var(--lyric-color), 20px 0 20px var(--lyric-color); opacity: 0; transform: scale(1.2) translateY(-10px); }
  50% { text-shadow: -5px 0 5px var(--lyric-color), 5px 0 5px var(--lyric-color); opacity: 0.5; }
  100% { text-shadow: 0 0 10px var(--lyric-color); opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 3. 冰晶凝结 */
.melancholy-anim-3 {
  animation: melancholy-frost 1.2s ease-in-out forwards;
}
@keyframes melancholy-frost {
  0% { letter-spacing: 2rem; filter: brightness(3) blur(10px); opacity: 0; transform: scale(0.8) translateY(-10px); }
  100% { letter-spacing: 0.2rem; filter: brightness(1) blur(0); opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 4. 流体汇聚 */
.melancholy-anim-4 {
  animation: melancholy-liquid 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes melancholy-liquid {
  0% { filter: contrast(20) blur(15px); opacity: 0; transform: scale(1.5) translateY(-30px); }
  50% { filter: contrast(15) blur(5px); opacity: 0.7; }
  100% { filter: contrast(1) blur(0); opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 5. 镜面投影 */
.melancholy-anim-5 {
  animation: melancholy-mirror 1.5s ease-in-out forwards;
}
@keyframes melancholy-mirror {
  0% { transform: rotateX(90deg) translateY(20px); opacity: 0; }
  100% { transform: rotateX(0deg) translateY(-10px) scale(1.08); opacity: 1; }
}

/* ================= 绝望状态下的 5 种随机动画 ================= */

/* 1. 故障闪烁 */
.desperate-anim-1 {
  animation: desperate-glitch 0.4s steps(4) forwards;
}
@keyframes desperate-glitch {
  0% { transform: translate(5px, -5px); opacity: 0; filter: hue-rotate(90deg); }
  20% { transform: translate(-10px, 5px); opacity: 0.5; }
  40% { transform: translate(10px, 0); opacity: 0.3; filter: contrast(2); }
  100% { transform: translate(0, -10px) scale(1.08); opacity: 1; }
}

/* 2. 破碎重组 */
.desperate-anim-2 {
  animation: desperate-shatter 0.5s cubic-bezier(0.36, 0, 0.66, -0.56) forwards;
}
@keyframes desperate-shatter {
  0% { transform: scale(0) rotate(45deg); filter: blur(10px); opacity: 0; }
  50% { transform: scale(1.5) rotate(-20deg); opacity: 0.8; }
  100% { transform: scale(1.08) rotate(0) translateY(-10px); opacity: 1; }
}

/* 3. 极速闪现 */
.desperate-anim-3 {
  animation: desperate-strobe 0.3s linear forwards;
}
@keyframes desperate-strobe {
  0%, 20%, 40%, 60% { opacity: 0; brightness: 5; }
  10%, 30%, 50%, 70% { opacity: 1; brightness: 2; }
  100% { opacity: 1; transform: scale(1.08) translateY(-10px); }
}

/* 4. 锯齿撞击 */
.desperate-anim-4 {
  animation: desperate-jagged 0.5s ease-out forwards;
}
@keyframes desperate-jagged {
  0% { transform: translate(-50px, -50px); opacity: 0; }
  30% { transform: translate(-20px, 10px); }
  60% { transform: translate(10px, -20px); }
  100% { transform: translate(0, -10px) scale(1.08); opacity: 1; }
}

/* 5. 噪点显影 */
.desperate-anim-5 {
  animation: desperate-noise 0.6s infinite alternate;
}
.desperate-anim-5-final {
  animation: desperate-noise-fade 0.6s forwards;
}
@keyframes desperate-noise-fade {
  0% { opacity: 0; filter: contrast(5); }
  100% { opacity: 1; transform: scale(1.08) translateY(-10px); }
}

.placeholder-text {
  font-size: 1.2rem;
  letter-spacing: 0.5rem;
  color: rgba(255, 255, 255, 0.1);
  text-transform: uppercase;
}

@media (max-width: 768px) {
  .lyric-line.active { font-size: 1.8rem; }
}
</style>
