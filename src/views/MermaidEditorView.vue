<script setup lang="ts">
import '@/styles/editor-shell.css'
import mermaid from 'mermaid'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAppReading } from '@/composables/useAppReading'
import SourceEditor from '@/components/SourceEditor.vue'
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
import AppModeNav from '@/components/AppModeNav.vue'
import EditorHistoryButtons from '@/components/EditorHistoryButtons.vue'
import { useTextEditHistory } from '@/composables/useTextEditHistory'
import { mermaidInitForTheme } from '@/themes'

type LayoutMode = 'split' | 'code' | 'preview'

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'split', label: '左右并列' },
  { value: 'code', label: '仅 Mermaid 代码' },
  { value: 'preview', label: '仅预览图' },
]

const LAYOUT_STORAGE_KEY = 'mermaid-editor-layout'

function loadStoredLayout(): LayoutMode {
  try {
    const v = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (v === 'split' || v === 'code' || v === 'preview') return v
  } catch {
    /* ignore */
  }
  return 'split'
}

function persistLayout(mode: LayoutMode) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

const DEFAULT_SAMPLE = `flowchart TB
  subgraph eras["范式演进"]
    PE["Prompt Engineering\n• 单次/局部指令优化\n• 写好提示词"]
    CE["Context Engineering\n• 动态拼装上下文\n• 检索 / 拼装策略"]
    HE["Harness Engineering\n• 文件系统 · 沙箱 · 工具链\n• 工作流 · 反馈环 · 验收 / QA\n• 权限 · 审计 · 人工闸门"]
    PE --> CE
    CE --> HE
  end

  subgraph absorb["远期趋势：大模型内化原 Harness 层部分能力"]
    M["增强后的大模型\n（能力向内收敛）"]
    T1["工具调用 / 协议生态\n（部分内化到模型行为与编排）"]
    T2["长上下文 + 结构化记忆\n（部分替代外部记忆工程）"]
    T3["多步推理与自我检查\n（生产环境仍可能需外部可信 QA）"]
    T4["策略与安全边界\n（编排变薄；合规常与人类流程仍在外）"]
    M --- T1
    M --- T2
    M --- T3
    M --- T4
  end

  HE -. "外部脚手架逐步变薄\n能力与逻辑部分被吸收" .-> absorb

  Human["人（驾驶员）\n目的地 · 风险偏好 · 品质标准 · 价值判断"]
  Human --> PE
  Human -. "模型越强，方向与取舍越关键" .-> M`

const source = ref(DEFAULT_SAMPLE)
const debouncedSource = ref(DEFAULT_SAMPLE)
const {
  canUndo,
  canRedo,
  undo: applyTextUndo,
  redo: applyTextRedo,
  reset: resetTextHistory,
} = useTextEditHistory(source, { debounceMs: 320 })
const layout = ref<LayoutMode>(loadStoredLayout())
const previewHost = ref<HTMLElement | null>(null)
const floatingEditorRef = ref<InstanceType<typeof FloatingSourceEditor> | null>(null)

const { reading, setReading } = useAppReading()

const monacoEditorTheme = computed(() => (reading.value === 'dark' ? 'vs-dark' : 'vs'))

function openFloatingEditor(lineNumber?: number) {
  floatingEditorRef.value?.open(lineNumber)
}

function onPreviewDblClick(ev: MouseEvent) {
  const svg = previewHost.value?.querySelector('svg')
  if (!svg) { openFloatingEditor(); return }
  const rect = svg.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
  const lineCount = source.value.split('\n').length
  const line = Math.max(1, Math.floor(ratio * lineCount) + 1)
  openFloatingEditor(line)
}

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

async function runRender() {
  const code = debouncedSource.value.trim()
  const host = previewHost.value
  if (!host) return

  const seq = ++renderSeq
  mermaid.initialize(
    mermaidInitForTheme('enterprise', {
      enterprisePreview: reading.value === 'dark' ? 'dark' : 'light',
    }),
  )

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

watch([debouncedSource, reading], runRender, { flush: 'post' })

onMounted(() => {
  debouncedSource.value = source.value
  void runRender()
})

function flushMermaidPreviewFromSource() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  debouncedSource.value = source.value
}

function onHistoryUndo() {
  applyTextUndo()
  flushMermaidPreviewFromSource()
}

function onHistoryRedo() {
  applyTextRedo()
  flushMermaidPreviewFromSource()
}

function loadSample() {
  resetTextHistory(DEFAULT_SAMPLE)
  flushMermaidPreviewFromSource()
}

watch(layout, (mode) => {
  persistLayout(mode)
  void nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})

function exportSvg() {
  const host = previewHost.value
  const svgEl = host?.querySelector('svg')
  let serialized: string | null = null

  if (svgEl) {
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }
    serialized = new XMLSerializer().serializeToString(clone)
  } else if (lastOkSvg.value) {
    serialized = lastOkSvg.value.includes('xmlns=')
      ? lastOkSvg.value
      : lastOkSvg.value.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  }

  if (!serialized?.trim()) {
    window.alert('当前没有可导出的图形，请先编写能通过解析的 Mermaid 代码。')
    return
  }

  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mermaid-${Date.now()}.svg`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="editor-page mermaid-editor-page">
    <header class="toolbar">
      <AppModeNav class="mermaid-toolbar-mode-nav" />
      <h1 class="title">Mermaid 编辑与预览</h1>
      <div class="toolbar-actions">
        <EditorHistoryButtons
          :can-undo="canUndo"
          :can-redo="canRedo"
          @undo="onHistoryUndo"
          @redo="onHistoryRedo"
        />
        <label class="field-inline">
          <span class="field-label">视图布局</span>
          <select v-model="layout" class="select" aria-label="视图布局">
            <option v-for="o in LAYOUT_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <button type="button" class="primary-btn" @click="exportSvg">导出 SVG</button>
        <button type="button" class="ghost-btn" @click="loadSample">载入示例</button>
      </div>
      <div class="theme-group theme-group--reading-end" role="group" aria-label="全站浅色 / 深色">
        <button
          type="button"
          class="theme-btn theme-btn--reading-icon"
          :class="{ active: reading === 'light' }"
          title="浅色模式（全站）"
          aria-label="切换到浅色模式"
          :aria-pressed="reading === 'light'"
          @click="setReading('light')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
        <button
          type="button"
          class="theme-btn theme-btn--reading-icon"
          :class="{ active: reading === 'dark' }"
          title="深色模式（全站，连线为灰色）"
          aria-label="切换到深色模式"
          :aria-pressed="reading === 'dark'"
          @click="setReading('dark')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </header>

    <main class="main" :class="`layout-${layout}`">
      <section v-show="layout !== 'preview'" class="pane editor-pane" aria-label="源码编辑">
        <h2 class="pane-title">源码</h2>
        <div class="pane-body">
          <SourceEditor v-model="source" :editor-theme="monacoEditorTheme" />
        </div>
      </section>
      <section v-show="layout !== 'code'" class="pane preview-pane" aria-label="预览">
        <h2 class="pane-title">预览</h2>
        <div v-if="previewError" class="error-banner" role="alert">
          {{ previewError }}
        </div>
        <div class="pane-body preview-scroll" @dblclick="onPreviewDblClick">
          <div ref="previewHost" class="mermaid-out" />
        </div>
      </section>
    </main>
    <FloatingSourceEditor
      ref="floatingEditorRef"
      v-model="source"
      title="Mermaid 源码编辑"
      :editor-theme="monacoEditorTheme"
    />
  </div>
</template>

<style scoped>
.mermaid-toolbar-mode-nav {
  flex: 0 0 auto;
  margin-right: 0.65rem;
}

.mermaid-editor-page :deep(.toolbar .theme-group--reading-end) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.4rem;
  margin-left: auto;
  justify-content: flex-end;
}

@media (max-width: 719px) {
  .mermaid-editor-page :deep(.toolbar .theme-group--reading-end) {
    flex-basis: 100%;
  }
}

.mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.2rem;
  border-color: var(--border);
  background: transparent;
  color: var(--text);
}

.mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon:hover:not(.active)) {
  border-color: #1a1a1e;
  color: #1a1a1e;
}

.mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon.active) {
  background: #1a1a1e;
  border-color: #1a1a1e;
  color: #fafafa;
}

.mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon:focus-visible) {
  outline: 2px solid #1a1a1e;
  outline-offset: 2px;
}

[data-reading='dark'] .mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon:hover:not(.active)) {
  border-color: #d1d5db;
  color: #f9fafb;
}

[data-reading='dark'] .mermaid-editor-page :deep(.theme-btn.theme-btn--reading-icon.active) {
  background: #f3f4f6;
  border-color: #f3f4f6;
  color: #111827;
}

.mermaid-editor-page :deep(.theme-btn--reading-icon svg) {
  display: block;
}
</style>
