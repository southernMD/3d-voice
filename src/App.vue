<script setup lang="ts">
import AudioVisualizer from './components/AudioVisualizer.vue';
</script>

<template>
  <main>
    <AudioVisualizer />
  </main>
</template>

<style>
main {
  user-select: none;
  width: 100vw;
  height: var(--visual-height, 100vh);
  margin: 0;
  padding: 0;
  overflow: hidden;
}

body {
  margin: 0;
  overflow: hidden;
}
</style>
