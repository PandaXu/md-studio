<!-- Markdown / Mermaid：单按钮点击在两种编辑器间切换 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isMarkdown = computed(
  () => route.name === 'markdown' || route.path === '/markdown' || route.path === '/',
)

const targetLabel = computed(() => (isMarkdown.value ? 'Mermaid' : 'Markdown'))

const title = computed(() =>
  isMarkdown.value ? '切换到 Mermaid 编辑器' : '切换到 Markdown 编辑器',
)

function toggle() {
  void router.push(isMarkdown.value ? '/mermaid' : '/markdown')
}
</script>

<template>
  <button
    type="button"
    class="app-mode-toggle"
    :aria-label="title"
    :title="title"
    @click="toggle"
  >
    <span class="app-mode-toggle-ico" aria-hidden="true">⇄</span>
    {{ targetLabel }}
  </button>
</template>

<style scoped>
.app-mode-toggle {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex-shrink: 0;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 500;
  height: 32px;
  min-height: 32px;
  padding: 0 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--doc-toolbar-icon-border, var(--doc-panel-border, rgb(213, 212, 226)));
  background: var(--doc-toolbar-icon-bg, var(--doc-panel-surface, #fff));
  color: var(--doc-toolbar-icon-color, var(--doc-panel-text, #1f2937));
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  max-width: max-content;
}

.app-mode-toggle:hover {
  filter: brightness(0.97);
  border-color: var(--doc-panel-active-bar, #4f46e5);
  color: var(--doc-panel-active-bar, #4f46e5);
}

.app-mode-toggle:focus-visible {
  outline: 2px solid var(--doc-panel-active-bar, #4f46e5);
  outline-offset: 2px;
}

.app-mode-toggle-ico {
  font-size: 0.75rem;
  opacity: 0.85;
}
</style>
