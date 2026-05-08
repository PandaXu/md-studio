<script setup lang="ts">
import '@/styles/editor-shell.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SourceEditor from '@/components/SourceEditor.vue'
import TuiEditor from '@/components/TuiEditor.vue'
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
import DocumentLibraryPanel from '@/components/DocumentLibraryPanel.vue'
import { useDocumentLibrary } from '@/composables/useDocumentLibrary'
import { renderMermaidBlocksIn } from '@/markdown/mermaidBlocks'
import { renderMarkdownToHtml } from '@/markdown/render'
import { sanitizeMarkdownHtml } from '@/markdown/sanitize'
import { MERMAID_THEMES, type MermaidThemeId } from '@/themes'

type LayoutMode = 'split' | 'code' | 'preview'
type ReadingMode = 'light' | 'dark'
type EditMode = 'raw' | 'wysiwyg'

const LAYOUT_KEY = 'markdown-editor-layout'
const READING_KEY = 'markdown-editor-reading'
const CHART_THEME_KEY = 'markdown-editor-mermaid-theme'
const EDIT_MODE_KEY = 'markdown-editor-edit-mode'
const SIDEBAR_COLLAPSED_KEY = 'markdown-editor-library-collapsed'

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'split', label: '左右并列' },
  { value: 'code', label: '仅 Markdown 源码' },
  { value: 'preview', label: '仅预览' },
]

function loadStoredLayout(): LayoutMode {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    if (v === 'split' || v === 'code' || v === 'preview') return v
  } catch {}
  return 'split'
}
function persistLayout(mode: LayoutMode) {
  try { localStorage.setItem(LAYOUT_KEY, mode) } catch {}
}

function loadStoredReading(): ReadingMode {
  try {
    const v = localStorage.getItem(READING_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return 'light'
}
function persistReading(mode: ReadingMode) {
  try { localStorage.setItem(READING_KEY, mode) } catch {}
}

function loadStoredChartTheme(): MermaidThemeId {
  try {
    const v = localStorage.getItem(CHART_THEME_KEY)
    if (v === 'default' || v === 'dark' || v === 'forest' || v === 'enterprise') return v
  } catch {}
  return 'default'
}
function persistChartTheme(id: MermaidThemeId) {
  try { localStorage.setItem(CHART_THEME_KEY, id) } catch {}
}

function loadStoredEditMode(): EditMode {
  try {
    const v = localStorage.getItem(EDIT_MODE_KEY)
    if (v === 'raw' || v === 'wysiwyg') return v
  } catch {}
  return 'raw'
}
function persistEditMode(mode: EditMode) {
  try { localStorage.setItem(EDIT_MODE_KEY, mode) } catch {}
}

function loadStoredSidebarCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
}
function persistSidebarCollapsed(v: boolean) {
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? '1' : '0') } catch {}
}

const lib = useDocumentLibrary()
const {
  unavailableMessage,
  activeId,
  activeContent,
  searchQuery,
  filteredDocs,
  hasDocs,
} = lib

const layout = ref<LayoutMode>(loadStoredLayout())
const reading = ref<ReadingMode>(loadStoredReading())
const chartTheme = ref<MermaidThemeId>(loadStoredChartTheme())
const editMode = ref<EditMode>(loadStoredEditMode())
const sidebarCollapsed = ref<boolean>(loadStoredSidebarCollapsed())

const debouncedSource = ref<string>(activeContent.value)
const previewHost = ref<HTMLElement | null>(null)

const topError = ref<string | null>(null)
const importBanner = ref<string | null>(null)
const floatingEditorRef = ref<InstanceType<typeof FloatingSourceEditor> | null>(null)

function openFloatingEditor(lineNumber?: number) {
  floatingEditorRef.value?.open(lineNumber)
}

function onPreviewDblClick(ev: MouseEvent) {
  const el = (ev.target as HTMLElement).closest('[data-line]')
  const line = el ? Number((el as HTMLElement).dataset.line) + 1 : undefined
  openFloatingEditor(line)
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pipelineSeq = 0

function debounceSourceUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    debouncedSource.value = activeContent.value
  }, 320)
}

watch(activeContent, debounceSourceUpdate, { flush: 'post' })
watch(activeId, () => {
  debouncedSource.value = activeContent.value
  void nextTick(() => {
    const host = previewHost.value
    if (host) host.scrollTop = 0
  })
})

const readingLabel = computed(() => (reading.value === 'light' ? '浅色' : '深色'))
const activeChartThemeLabel = computed(
  () => MERMAID_THEMES.find((t) => t.id === chartTheme.value)?.label ?? chartTheme.value,
)
const editModeLabel = computed(() => (editMode.value === 'raw' ? 'Raw' : 'WYSIWYG'))
const previewWrapClass = computed(() => (reading.value === 'light' ? 'reading-light' : 'reading-dark'))

function setChartTheme(next: MermaidThemeId) { chartTheme.value = next; persistChartTheme(next) }
function setReading(next: ReadingMode) { reading.value = next; persistReading(next) }
function setEditMode(next: EditMode) { editMode.value = next; persistEditMode(next) }

async function runMarkdownPipeline() {
  const seq = ++pipelineSeq
  let raw: string
  try {
    raw = renderMarkdownToHtml(debouncedSource.value)
  } catch (e) {
    if (seq !== pipelineSeq) return
    topError.value = e instanceof Error ? e.message : String(e)
    return
  }
  let clean: string
  try {
    clean = sanitizeMarkdownHtml(raw)
  } catch (e) {
    if (seq !== pipelineSeq) return
    topError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (seq !== pipelineSeq) return
  topError.value = null
  const host = previewHost.value
  if (!host) return
  host.innerHTML = clean
  await nextTick()
  if (seq !== pipelineSeq) return
  await renderMermaidBlocksIn(host, chartTheme.value, seq, () => pipelineSeq)
}

watch(debouncedSource, runMarkdownPipeline, { flush: 'post' })
watch(chartTheme, () => { void runMarkdownPipeline() })
watch(layout, (mode) => {
  persistLayout(mode)
  void nextTick(() => { window.dispatchEvent(new Event('resize')) })
})
watch(editMode, persistEditMode)
watch(sidebarCollapsed, persistSidebarCollapsed)

onMounted(() => {
  debouncedSource.value = activeContent.value
  void runMarkdownPipeline()
})
onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

const EXPORT_CSS_LIGHT = `
body{margin:0;padding:1.25rem;font-family:system-ui,-apple-system,sans-serif;background:#f4f5f7;color:#1a1d24;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid #d8dce3;padding:0.35rem 0.5rem;}
.md-export pre{background:#f4f5f7;padding:0.75rem;border-radius:6px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#991b1b;font-size:0.875rem;}
`
const EXPORT_CSS_DARK = `
body{margin:0;padding:1.25rem;font-family:system-ui,-apple-system,sans-serif;background:#111827;color:#e5e7eb;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid #374151;padding:0.35rem 0.5rem;}
.md-export pre{background:#1f2937;padding:0.75rem;border-radius:6px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#fca5a5;font-size:0.875rem;}
`

function exportHtml() {
  const host = previewHost.value
  if (!host) { window.alert('预览区未就绪。'); return }
  const clone = host.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.mermaid-block').forEach((block) => {
    const out = block.querySelector('.mermaid-out')
    const svg = out?.querySelector('svg')
    if (svg) {
      const ser = new XMLSerializer().serializeToString(svg.cloneNode(true) as SVGSVGElement)
      if (out) out.innerHTML = ser
    } else if (out) {
      out.innerHTML = '<p>图表未渲染成功</p>'
    }
    block.querySelector('.mermaid-error')?.remove()
    block.querySelector('details.mermaid-source-details')?.remove()
  })
  const style = reading.value === 'dark' ? EXPORT_CSS_DARK : EXPORT_CSS_LIGHT
  const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Markdown 导出</title>
<style>${style}</style>
</head>
<body>
<div class="md-export">${clone.innerHTML}</div>
</body>
</html>`
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markdown-${Date.now()}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function downloadActiveMd() {
  const out = lib.exportActiveAsMarkdown()
  if (!out) return
  const url = URL.createObjectURL(out.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = out.filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function onImported(items: { title: string; content: string; titleLocked: boolean }[]) {
  if (!items.length) return
  let firstId: string | null = null
  for (const it of items) {
    const doc = await lib.createDocFromContent(it.content, {
      title: it.title,
      titleLocked: it.titleLocked,
    })
    if (!firstId) firstId = doc.id
  }
  if (firstId) await lib.setActive(firstId)
  importBanner.value = `已导入 ${items.length} 篇文档`
  setTimeout(() => { importBanner.value = null }, 4000)
}

function onImportError(message: string) {
  importBanner.value = message
}

async function onNewDoc() {
  await lib.createEmptyDoc()
}

async function onLoadSample() {
  await lib.loadSampleAsNewDoc()
}

async function onSelect(id: string) { await lib.setActive(id) }
async function onRename(id: string, newTitle: string) { await lib.renameDoc(id, newTitle) }
async function onUnlock(id: string) { await lib.unlockTitle(id) }
async function onDelete(id: string) { await lib.deleteDoc(id) }
</script>

<template>
  <div
    class="editor-shell-with-sidebar"
    :data-sidebar-collapsed="sidebarCollapsed ? 'true' : 'false'"
  >
    <DocumentLibraryPanel
      v-model:collapsed="sidebarCollapsed"
      v-model:search-query="searchQuery"
      :docs="filteredDocs"
      :active-id="activeId"
      :has-docs="hasDocs"
      @select="onSelect"
      @rename="onRename"
      @unlock-title="onUnlock"
      @delete="onDelete"
      @new-doc="onNewDoc"
      @download="downloadActiveMd"
      @imported="onImported"
      @import-error="onImportError"
    />

    <div class="editor-page">
      <div v-if="unavailableMessage" class="doc-library-banner" role="alert">
        {{ unavailableMessage }}
      </div>
      <div v-if="importBanner" class="doc-library-banner" role="status">
        {{ importBanner }}
      </div>

      <header class="toolbar">
        <h1 class="title">Markdown 编辑与预览</h1>
        <div v-if="layout !== 'code'" class="theme-group" role="group" aria-label="阅读模式">
          <span class="theme-label">正文</span>
          <button type="button" class="theme-btn" :class="{ active: reading === 'light' }"
            :aria-pressed="reading === 'light'" @click="setReading('light')">浅色</button>
          <button type="button" class="theme-btn" :class="{ active: reading === 'dark' }"
            :aria-pressed="reading === 'dark'" @click="setReading('dark')">深色</button>
        </div>
        <div v-if="layout !== 'code'" class="theme-group" role="group" aria-label="图表主题">
          <span class="theme-label">图表主题</span>
          <button v-for="t in MERMAID_THEMES" :key="t.id" type="button" class="theme-btn"
            :class="{ active: chartTheme === t.id }" :aria-pressed="chartTheme === t.id"
            :title="t.label" @click="setChartTheme(t.id)">{{ t.id }}</button>
        </div>
        <div v-if="layout === 'code'" class="theme-group" role="group" aria-label="编辑模式">
          <span class="theme-label">编辑模式</span>
          <button type="button" class="theme-btn" :class="{ active: editMode === 'raw' }"
            :aria-pressed="editMode === 'raw'" @click="setEditMode('raw')">Raw</button>
          <button type="button" class="theme-btn" :class="{ active: editMode === 'wysiwyg' }"
            :aria-pressed="editMode === 'wysiwyg'" @click="setEditMode('wysiwyg')">WYSIWYG</button>
        </div>
        <div class="toolbar-actions">
          <label class="field-inline">
            <span class="field-label">视图布局</span>
            <select v-model="layout" class="select" aria-label="视图布局">
              <option v-for="o in LAYOUT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" @click="exportHtml">下载 HTML</button>
        </div>
      </header>

      <p class="hint">
        <template v-if="layout !== 'code'">
          阅读模式：<strong>{{ readingLabel }}</strong>；图表主题：<strong>{{ activeChartThemeLabel }}</strong>；
        </template>
        布局：<strong>{{ LAYOUT_OPTIONS.find((o) => o.value === layout)?.label }}</strong>
        <template v-if="layout === 'code'">
          ；编辑模式：<strong>{{ editModeLabel }}</strong>
        </template>
      </p>

      <main v-if="hasDocs" class="main" :class="`layout-${layout}`">
        <section v-show="layout !== 'preview'" class="pane editor-pane" aria-label="源码编辑">
          <h2 class="pane-title">源码</h2>
          <div class="pane-body">
            <SourceEditor
              v-if="layout === 'split' || (layout === 'code' && editMode === 'raw')"
              v-model="activeContent"
              language="markdown"
            />
            <TuiEditor
              v-else-if="layout === 'code'"
              :key="activeId ?? 'no-doc'"
              v-model="activeContent"
              :chart-theme="chartTheme"
            />
          </div>
        </section>
        <section v-show="layout !== 'code'" class="pane preview-pane" aria-label="预览">
          <h2 class="pane-title">预览</h2>
          <div v-if="topError" class="error-banner" role="alert">{{ topError }}</div>
          <div class="pane-body preview-scroll" @dblclick="onPreviewDblClick">
            <div class="markdown-preview-wrap" :class="previewWrapClass">
              <div ref="previewHost" class="markdown-body" />
            </div>
          </div>
        </section>
      </main>

      <section v-else class="doc-empty-state" aria-label="空文档库">
        <h2>还没有文档</h2>
        <p>新建一篇空文档开始编写，或加载示例文章查看渲染效果。</p>
        <div class="doc-empty-actions">
          <button type="button" class="primary-btn" @click="onNewDoc">新建空文档</button>
          <button type="button" class="ghost-btn" @click="onLoadSample">加载示例</button>
        </div>
      </section>

      <FloatingSourceEditor
        ref="floatingEditorRef"
        v-model="activeContent"
        language="markdown"
        title="Markdown 源码编辑"
      />
    </div>
  </div>
</template>

<style scoped>
.markdown-preview-wrap {
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-height: 2rem;
}

.reading-light {
  --md-text: #1a1d24;
  --md-muted: #5c6578;
  --md-bg: #f9fafb;
  --md-border: #e5e7eb;
  --md-code-bg: #f3f4f6;
  --md-line-height: 1.7;
  --md-heading-line: 1.28;
  background: var(--md-bg);
  color: var(--md-text);
}

.reading-dark {
  --md-text: #e5e7eb;
  --md-muted: #9ca3af;
  --md-bg: #1f2937;
  --md-border: #374151;
  --md-code-bg: #111827;
  --md-line-height: 1.72;
  --md-heading-line: 1.3;
  background: var(--md-bg);
  color: var(--md-text);
}

.markdown-body {
  font-size: 0.9375rem;
  line-height: var(--md-line-height, 1.7);
}

.markdown-body :deep(h1) {
  margin: 0 0 0.75rem;
  padding-bottom: 0.35rem;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: var(--md-heading-line, 1.28);
  border-bottom: 1px solid var(--md-border);
}

.markdown-body :deep(h2) {
  margin: 1.75rem 0 0.65rem;
  font-size: 1.25rem;
  font-weight: 650;
  line-height: var(--md-heading-line, 1.28);
}

.markdown-body :deep(h2:first-child),
.markdown-body :deep(h1 + h2) {
  margin-top: 0.35rem;
}

.markdown-body :deep(h3) {
  margin: 1.35rem 0 0.5rem;
  font-size: 1.0625rem;
  font-weight: 650;
  line-height: var(--md-heading-line, 1.28);
}

.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1.1rem 0 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: var(--md-heading-line, 1.28);
  color: var(--md-text);
}

.markdown-body :deep(p) {
  margin: 0 0 0.9rem;
  line-height: inherit;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(a) {
  color: var(--accent, #2563eb);
}

.markdown-body :deep(blockquote) {
  margin: 0.85rem 0;
  padding: 0.35rem 0 0.35rem 1rem;
  border-left: 3px solid var(--md-border);
  color: var(--md-muted);
  line-height: inherit;
}

.markdown-body :deep(blockquote p) {
  margin: 0.35rem 0;
}

.markdown-body :deep(hr) {
  margin: 1.35rem 0;
  border: none;
  border-top: 1px solid var(--md-border);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--md-border);
  padding: 0.45rem 0.6rem;
  vertical-align: top;
}

.markdown-body :deep(th) {
  font-weight: 600;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5rem 0 0.9rem;
  padding-left: 1.35rem;
  line-height: inherit;
}

.markdown-body :deep(li) {
  margin: 0.28rem 0;
  padding-left: 0.15rem;
}

.markdown-body :deep(li > p) {
  margin: 0.35rem 0;
}

.markdown-body :deep(ul ul),
.markdown-body :deep(ol ol),
.markdown-body :deep(ul ol),
.markdown-body :deep(ol ul) {
  margin: 0.35rem 0 0.5rem;
}

.markdown-body :deep(pre) {
  margin: 0.85rem 0;
  background: var(--md-code-bg);
  padding: 0.85rem 1rem;
  border-radius: 6px;
  overflow: auto;
  font-size: 0.8125rem;
  line-height: 1.55;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.markdown-body :deep(p code),
.markdown-body :deep(li code),
.markdown-body :deep(td code),
.markdown-body :deep(th code) {
  padding: 0.12em 0.4em;
  border-radius: 4px;
  background: var(--md-code-bg);
  font-size: 0.88em;
}

.markdown-body :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
}

.markdown-body :deep(.mermaid-block) {
  margin: 1rem 0;
}

.markdown-body :deep(details.mermaid-source-details) {
  margin: 0 0 0.5rem;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: var(--md-code-bg);
  overflow: hidden;
}

.markdown-body :deep(summary.mermaid-source-summary) {
  cursor: pointer;
  padding: 0.45rem 0.65rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--md-muted);
  user-select: none;
  list-style-position: outside;
}

.markdown-body :deep(summary.mermaid-source-summary:hover) {
  color: var(--accent, #2563eb);
}

.markdown-body :deep(details.mermaid-source-details pre.mermaid-source) {
  margin: 0;
  border-top: 1px solid var(--md-border);
  border-radius: 0 0 6px 6px;
}

.markdown-body :deep(.mermaid-error) {
  font-size: 0.8125rem;
  color: var(--error-text, #991b1b);
  white-space: pre-wrap;
}

.reading-dark .markdown-body :deep(.mermaid-error) {
  color: #fca5a5;
}

.load-md-wrap {
  position: relative;
  display: inline-block;
}

.load-md-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 11rem;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  z-index: 20;
}

.load-md-menu-item {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.45rem 0.85rem;
  border: none;
  background: transparent;
  color: var(--text, #111);
  cursor: pointer;
}

.load-md-menu-item:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.08);
}

.load-md-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.load-md-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
}

.load-md-dialog {
  width: min(520px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
}

.load-md-dialog-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.load-md-url-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
}

.load-md-url-label-text {
  color: var(--muted, #5c6578);
}

.load-md-url-input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
}

.load-md-err {
  margin: 0.5rem 0 0;
  color: #b45309;
  font-size: 0.8125rem;
}

.load-md-dialog-actions {
  margin-top: 0.85rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.doc-empty-state {
  margin-top: 1rem;
  padding: 2.5rem 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: center;
  color: var(--text);
}
.doc-empty-state h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}
.doc-empty-state p {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.doc-empty-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}
</style>
