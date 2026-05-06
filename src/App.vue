<script setup lang="ts">
import mermaid from 'mermaid'
import { computed, onMounted, ref, watch } from 'vue'
import SourceEditor from './components/SourceEditor.vue'
import {
  MERMAID_THEMES,
  loadStoredTheme,
  mermaidInitForTheme,
  persistTheme,
  type MermaidThemeId,
} from './themes'

const DEFAULT_SAMPLE = `flowchart LR
  A[开始] --> B{判断}
  B -->|是| C[结束]
  B -->|否| A`

const source = ref(DEFAULT_SAMPLE)
const debouncedSource = ref(DEFAULT_SAMPLE)
const theme = ref<MermaidThemeId>(loadStoredTheme() ?? 'default')
const previewHost = ref<HTMLElement | null>(null)

const previewError = ref<string | null>(null)
const lastOkSvg = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let renderSeq = 0

function debounceSourceUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    debouncedSource.value = source.value
  }, 320)
}

watch(source, debounceSourceUpdate, { flush: 'post' })

function setTheme(next: MermaidThemeId) {
  theme.value = next
  persistTheme(next)
}

const activeThemeLabel = computed(
  () => MERMAID_THEMES.find((t) => t.id === theme.value)?.label ?? theme.value,
)

async function runRender() {
  const code = debouncedSource.value.trim()
  const host = previewHost.value
  if (!host) return

  const seq = ++renderSeq
  mermaid.initialize(mermaidInitForTheme(theme.value))

  if (!code) {
    host.innerHTML = ''
    lastOkSvg.value = null
    previewError.value = null
    return
  }

  try {
    await mermaid.parse(code)
  } catch (e) {
    if (seq !== renderSeq) return
    const msg = e instanceof Error ? e.message : String(e)
    previewError.value = msg
    return
  }

  const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  try {
    const { svg } = await mermaid.render(id, code)
    if (seq !== renderSeq) return
    previewError.value = null
    lastOkSvg.value = svg
    host.innerHTML = svg
  } catch (e) {
    if (seq !== renderSeq) return
    const msg = e instanceof Error ? e.message : String(e)
    previewError.value = msg
    if (lastOkSvg.value) {
      host.innerHTML = lastOkSvg.value
    }
  }
}

watch([debouncedSource, theme], runRender, { flush: 'post' })

onMounted(() => {
  debouncedSource.value = source.value
  void runRender()
})

function loadSample() {
  source.value = DEFAULT_SAMPLE
  debouncedSource.value = DEFAULT_SAMPLE
}
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <h1 class="title">Mermaid 编辑与预览</h1>
      <div class="theme-group" role="group" aria-label="预览主题">
        <span class="theme-label">预览主题</span>
        <button
          v-for="t in MERMAID_THEMES"
          :key="t.id"
          type="button"
          class="theme-btn"
          :class="{ active: theme === t.id }"
          :aria-pressed="theme === t.id"
          :title="t.label"
          @click="setTheme(t.id)"
        >
          {{ t.id }}
        </button>
      </div>
      <button type="button" class="ghost-btn" @click="loadSample">载入示例</button>
    </header>

    <p class="hint">当前主题：<strong>{{ activeThemeLabel }}</strong>（已写入 localStorage）</p>

    <main class="main">
      <section class="pane editor-pane" aria-label="源码编辑">
        <h2 class="pane-title">源码</h2>
        <div class="pane-body">
          <SourceEditor v-model="source" />
        </div>
      </section>
      <section class="pane preview-pane" aria-label="预览">
        <h2 class="pane-title">预览</h2>
        <div v-if="previewError" class="error-banner" role="alert">
          {{ previewError }}
        </div>
        <div class="pane-body preview-scroll">
          <div ref="previewHost" class="mermaid-out" />
        </div>
      </section>
    </main>
  </div>
</template>

<style>
:root {
  --bg: #f4f5f7;
  --surface: #fff;
  --border: #d8dce3;
  --text: #1a1d24;
  --muted: #5c6578;
  --accent: #2563eb;
  --error-bg: #fef2f2;
  --error-border: #fecaca;
  --error-text: #991b1b;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  background: var(--bg);
  color: var(--text);
}

#app {
  min-height: 100vh;
}
</style>

<style scoped>
.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 1.25rem 2rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 12rem;
}

.theme-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.theme-label {
  font-size: 0.8125rem;
  color: var(--muted);
  margin-right: 0.25rem;
}

.theme-btn {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}

.theme-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.theme-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.ghost-btn {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.ghost-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hint {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  color: var(--muted);
}

.main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
  min-height: calc(100vh - 8rem);
}

@media (max-width: 900px) {
  .main {
    grid-template-columns: 1fr;
    min-height: auto;
  }
}

.pane {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  min-height: 360px;
}

.pane-title {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.pane-body {
  flex: 1;
  min-height: 0;
}

.editor-pane .pane-body {
  padding: 0;
}

.preview-scroll {
  overflow: auto;
  padding: 1rem;
}

.error-banner {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  background: var(--error-bg);
  border-bottom: 1px solid var(--error-border);
  color: var(--error-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.mermaid-out {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
}

.mermaid-out :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
