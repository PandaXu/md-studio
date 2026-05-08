<script setup lang="ts">
defineProps<{
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  undo: []
  redo: []
}>()
</script>

<template>
  <div class="history-group" role="group" aria-label="编辑历史">
    <button
      type="button"
      class="history-btn"
      :disabled="!canUndo"
      title="撤销上一步"
      aria-label="撤销上一步"
      @click="emit('undo')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      </svg>
    </button>
    <button
      type="button"
      class="history-btn"
      :disabled="!canRedo"
      title="重做下一步"
      aria-label="重做下一步"
      @click="emit('redo')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.history-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.history-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.history-btn:hover:not(:disabled) {
  border-color: #1a1a1e;
  color: #1a1a1e;
}

.history-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.history-btn:focus-visible {
  outline: 2px solid var(--accent, #2563eb);
  outline-offset: 2px;
}

[data-reading='dark'] .history-btn:hover:not(:disabled) {
  border-color: #d1d5db;
  color: #f9fafb;
}

[data-reading='dark'] .history-btn:disabled {
  opacity: 0.28;
}
</style>
