<template>
  <div class="edit-dialog-content">
    <div class="field">
      <label>歌名</label>
      <input v-model="localName" class="dialog-input" />
    </div>
    <div class="field">
      <label>歌手</label>
      <input v-model="localArtist" class="dialog-input" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  name: string | null;
  artist: string | null;
}>();

const emit = defineEmits(['update:name', 'update:artist']);

const localName = ref(props.name || '');
const localArtist = ref(props.artist || '');

watch(localName, (val) => emit('update:name', val));
watch(localArtist, (val) => emit('update:artist', val));
</script>

<style scoped>
.edit-dialog-content { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
.field { display: flex; flex-direction: column; gap: 0.5rem; }
.field label { font-size: 0.75rem; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; }
.dialog-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.7rem;
  color: #fff;
  outline: none;
}
.dialog-input:focus { border-color: #00ffff; }
</style>
