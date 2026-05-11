<script setup lang="ts">
defineProps<{
  modelValue: 'local' | 'web'
  workspacePath: string | null
  isElectron: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: 'local' | 'web']
  selectFolder: []
}>()

function switchTo(value: 'local' | 'web') {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="file-mode-switch">
    <div v-if="modelValue === 'local' && workspacePath" class="file-mode-workspace" :title="workspacePath">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="file-mode-workspace-name">{{ workspacePath.split('/').pop() || workspacePath }}</span>
    </div>
    <button
      v-if="modelValue === 'local' && !workspacePath"
      type="button"
      class="file-mode-open-btn"
      :data-disabled="isElectron ? undefined : ''"
      @click="isElectron ? emit('selectFolder') : undefined"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      打开文件夹
    </button>
    <p v-if="modelValue === 'local' && !isElectron" class="file-mode-hint">需要 MD Studio 桌面应用才能使用本地模式</p>

    <div class="file-mode-segment" role="radiogroup" aria-label="文件管理模式">
      <button
        type="button"
        role="radio"
        class="file-mode-seg-btn"
        :class="{ active: modelValue === 'local' }"
        :aria-checked="modelValue === 'local'"
        :title="isElectron ? '本地文件系统模式' : '本地文件系统模式（需桌面应用）'"
        @click="switchTo('local')"
      >
        本地
      </button>
      <button
        type="button"
        role="radio"
        class="file-mode-seg-btn"
        :class="{ active: modelValue === 'web' }"
        :aria-checked="modelValue === 'web'"
        title="Web 模式（浏览器存储）"
        @click="switchTo('web')"
      >
        Web
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-mode-switch {
  margin-top: auto;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--doc-panel-border);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex-shrink: 0;
}

.file-mode-workspace {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--doc-panel-muted);
  padding: 0.15rem 0.3rem;
  overflow: hidden;
}

.file-mode-workspace svg {
  flex-shrink: 0;
}

.file-mode-workspace-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-mode-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px dashed var(--doc-panel-border);
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
}

.file-mode-open-btn[data-disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-mode-open-btn:hover:not([data-disabled]) {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.file-mode-segment {
  display: flex;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--doc-panel-border);
}

.file-mode-seg-btn {
  flex: 1;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.25rem 0.4rem;
  border: none;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.file-mode-seg-btn:hover:not(:disabled) {
  background: var(--doc-panel-hover);
}

.file-mode-seg-btn.active {
  background: var(--doc-panel-active-bg);
  color: var(--doc-panel-text);
}

.file-mode-seg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-mode-hint {
  margin: 0;
  font-size: 0.65rem;
  color: var(--doc-panel-muted);
  text-align: center;
  opacity: 0.7;
}
</style>
