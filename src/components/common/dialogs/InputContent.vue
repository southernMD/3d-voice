<template>
  <div class="input-dialog-content">
    <p class="label">{{ label }}</p>
    <input 
      v-model="inputValue" 
      class="dialog-input" 
      :placeholder="placeholder"
      autofocus
      @keyup.enter="$emit('submit')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  label: string;
  placeholder?: string;
}>();

const emit = defineEmits(['update:modelValue', 'submit']);
const inputValue = ref(props.modelValue);

watch(inputValue, (val) => {
  emit('update:modelValue', val);
});
</script>

<style scoped>
.input-dialog-content { width: 100%; }
.label { font-size: 0.8rem; color: rgba(255, 255, 255, 0.5); margin-bottom: 0.8rem; }
.dialog-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.8rem;
  color: #fff;
  outline: none;
  transition: border-color 0.3s;
}
.dialog-input:focus { border-color: #00ffff; }
</style>
