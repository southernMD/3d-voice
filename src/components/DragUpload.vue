<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

const emit = defineEmits<{
  (e: 'dropped', files: File[]): void;
}>();

/**
 * 递归遍历文件系统条目
 */
const traverseFileTree = async (entry: FileSystemEntry, fileList: File[]): Promise<void> => {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file((file: File) => {
        fileList.push(file);
        resolve();
      });
    });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();
    const entries: FileSystemEntry[] = await new Promise((resolve) => {
      dirReader.readEntries((results) => resolve(results as FileSystemEntry[]));
    });

    for (const subEntry of entries) {
      await traverseFileTree(subEntry, fileList);
    }
  }
};

const handleDrop = async (e: DragEvent) => {
  e.preventDefault();
  
  const items = e.dataTransfer?.items;
  if (!items) return;

  const files: File[] = [];
  const promises: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item.webkitGetAsEntry();
    if (entry) {
      promises.push(traverseFileTree(entry, files));
    }
  }

  await Promise.all(promises);
  if (files.length > 0) {
    emit('dropped', files);
  }
};

const preventDefault = (e: DragEvent) => e.preventDefault();

// 监听全局拖拽
onMounted(() => {
  window.addEventListener('dragover', preventDefault);
  window.addEventListener('drop', handleDrop);
});

onUnmounted(() => {
  window.removeEventListener('dragover', preventDefault);
  window.removeEventListener('drop', handleDrop);
});
</script>

<template>
  <!-- 纯逻辑组件，不渲染任何 UI -->
  <div style="display: none;"></div>
</template>
