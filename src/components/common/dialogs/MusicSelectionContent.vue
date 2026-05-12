<template>
  <div class="selection-dialog-content">
    <p class="hint">匹配度较低，请在下方候选项中选择正确的歌曲：</p>
    <div class="list">
      <div 
        v-for="(item, index) in candidates" 
        :key="item.id"
        :class="['candidate-item', { active: modelValue === index }]"
        @click="$emit('update:modelValue', index)"
      >
        <span class="index">{{ index + 1 }}</span>
        <div class="info">
          <span class="name">{{ item.name }}</span>
          <span class="artist">{{ item.artist }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  candidates: Array<{ id: number; name: string; artist: string }>;
}>();

defineEmits(['update:modelValue']);
</script>

<style scoped>
.selection-dialog-content { width: 100%; max-height: 300px; display: flex; flex-direction: column; gap: 1rem; }
.hint { font-size: 0.85rem; color: rgba(255, 255, 255, 0.5); }
.list { 
  overflow-y: auto; 
  display: flex; 
  flex-direction: column; 
  gap: 0.5rem;
  padding-right: 0.5rem;
}
.candidate-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.candidate-item:hover { background: rgba(255, 255, 255, 0.08); }
.candidate-item.active {
  background: rgba(0, 255, 255, 0.1);
  border-color: #00ffff;
}
.index { font-size: 0.8rem; color: #00ffff; opacity: 0.5; width: 20px; }
.info { display: flex; flex-direction: column; }
.name { font-size: 0.9rem; color: #fff; }
.artist { font-size: 0.75rem; color: rgba(255, 255, 255, 0.4); }

/* Custom scrollbar */
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
</style>
