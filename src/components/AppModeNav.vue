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
    <svg class="app-mode-toggle-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
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
  height: 28px;
  min-height: 28px;
  padding: 0 0.45rem;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--doc-toolbar-icon-color);
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  max-width: max-content;
}

.app-mode-toggle:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.app-mode-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.app-mode-toggle-ico {
  flex-shrink: 0;
  opacity: 0.6;
}
</style>
