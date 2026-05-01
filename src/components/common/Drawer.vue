<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  visible: boolean;
  title?: string;
  direction?: 'left' | 'right';
  width?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  direction: 'right',
  width: '350px'
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="drawer-container" :class="{ 'is-visible': visible }">
    <!-- 背景遮罩 -->
    <Transition name="fade">
      <div v-if="visible" class="drawer-mask" @click="emit('close')"></div>
    </Transition>

    <!-- 抽屉主体 -->
    <Transition :name="direction === 'left' ? 'slide-left' : 'slide-right'">
      <div 
        v-if="visible" 
        class="drawer-content glass" 
        :class="direction"
        :style="{ width: width }"
      >
        <div class="drawer-header">
          <slot name="header">
            <h2 class="drawer-title">{{ title }}</h2>
            <button class="close-btn" @click="emit('close')">
              <i class="iconfont icon-guanbi_o"></i>
            </button>
          </slot>
        </div>

        <div class="drawer-body">
          <slot></slot>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.drawer-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2000;
  pointer-events: none;
}

.is-visible {
  pointer-events: auto;
}

.drawer-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.drawer-content {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(10, 10, 10, 0.85);
  backdrop-filter: blur(40px);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
}

.drawer-content.right {
  right: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px 0 0 20px;
}

.drawer-content.left {
  left: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 20px 20px 0;
}

.drawer-header {
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.drawer-title {
  margin: 0;
  font-weight: 200;
  font-size: 1.2rem;
  letter-spacing: 0.2rem;
  color: rgba(255, 255, 255, 0.9);
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.close-btn:hover {
  opacity: 1;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
}

/* 动画效果 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 右侧滑入 */
.slide-right-enter-active, .slide-right-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-right-enter-from, .slide-right-leave-to {
  transform: translateX(100%);
}

/* 左侧滑入 */
.slide-left-enter-active, .slide-left-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-left-enter-from, .slide-left-leave-to {
  transform: translateX(-100%);
}

/* 滚动条深层穿透 */
:deep(.drawer-body),
:deep(*)::-webkit-scrollbar-corner {
  background: transparent;
}

:deep(*) {
  /* Firefox */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

:deep(*)::-webkit-scrollbar {
  width: 6px;
}

:deep(*)::-webkit-scrollbar-track {
  background: transparent;
}

:deep(*)::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

:deep(*)::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
  background-clip: padding-box;
}
</style>
