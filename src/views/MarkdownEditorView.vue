<script setup lang="ts">
import '@/styles/editor-shell.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SourceEditor from '@/components/SourceEditor.vue'
import TuiEditor from '@/components/TuiEditor.vue'
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
import DocumentLibraryPanel from '@/components/DocumentLibraryPanel.vue'
import { useAppReading } from '@/composables/useAppReading'
import { useDocumentLibrary } from '@/composables/useDocumentLibrary'
import { renderMermaidBlocksIn } from '@/markdown/mermaidBlocks'
import { renderMarkdownToHtml } from '@/markdown/render'
import { sanitizeMarkdownHtml } from '@/markdown/sanitize'
import type { MermaidThemeId } from '@/themes'

type LayoutMode = 'split' | 'code' | 'preview'
type EditMode = 'raw' | 'wysiwyg'

const LAYOUT_KEY = 'markdown-editor-layout'
const EDIT_MODE_KEY = 'markdown-editor-edit-mode'
const SIDEBAR_COLLAPSED_KEY = 'markdown-editor-library-collapsed'
const SIDEBAR_WIDTH_PX_KEY = 'markdown-editor-library-sidebar-px'

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

/** Markdown 预览 / TUI 内 Mermaid 固定为企业风主题 */
const MARKDOWN_MERMAID_THEME: MermaidThemeId = 'enterprise'

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

function docSidebarMaxWidthPx(): number {
  if (typeof window === 'undefined') return 800
  return Math.max(280, Math.min(800, window.innerWidth - 320))
}

function clampDocSidebarWidth(px: number): number {
  return Math.min(Math.max(Math.round(px), 200), docSidebarMaxWidthPx())
}

function loadStoredSidebarWidthPx(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_PX_KEY)
    if (raw != null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return clampDocSidebarWidth(n)
    }
  } catch {}
  return clampDocSidebarWidth(260)
}

function persistSidebarWidthPx() {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_PX_KEY, String(sidebarWidthPx.value))
  } catch {}
}

const windowWidthForSidebar = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const sidebarWidthPx = ref(loadStoredSidebarWidthPx())

const sidebarAriaMax = computed(() =>
  Math.max(280, Math.min(800, windowWidthForSidebar.value - 320)),
)

const docShellInlineStyle = computed(() => {
  if (sidebarCollapsed.value) return undefined
  return { '--doc-sidebar-w': `${sidebarWidthPx.value}px` } as Record<string, string>
})

let sidebarResizeStartX = 0
let sidebarResizeStartW = 0

function onDocSidebarResizeMove(ev: PointerEvent) {
  const dx = ev.clientX - sidebarResizeStartX
  sidebarWidthPx.value = clampDocSidebarWidth(sidebarResizeStartW + dx)
}

function onDocSidebarResizeUp() {
  document.removeEventListener('pointermove', onDocSidebarResizeMove)
  document.removeEventListener('pointerup', onDocSidebarResizeUp)
  document.removeEventListener('pointercancel', onDocSidebarResizeUp)
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
  persistSidebarWidthPx()
}

function onDocSidebarResizeDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  ev.preventDefault()
  sidebarResizeStartX = ev.clientX
  sidebarResizeStartW = sidebarWidthPx.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('pointermove', onDocSidebarResizeMove)
  document.addEventListener('pointerup', onDocSidebarResizeUp)
  document.addEventListener('pointercancel', onDocSidebarResizeUp)
}

function onWindowResizeDocSidebar() {
  windowWidthForSidebar.value = window.innerWidth
  sidebarWidthPx.value = clampDocSidebarWidth(sidebarWidthPx.value)
}

const lib = useDocumentLibrary()
const {
  status,
  unavailableMessage,
  activeDoc,
  activeId,
  activeContent,
  searchQuery,
  filteredDocs,
  docs,
  folders,
  treeMode,
  hasLibraryItems,
  hasDocs,
} = lib

const displayPanelDocs = computed(() => (treeMode.value ? docs.value : filteredDocs.value))

const layout = ref<LayoutMode>(loadStoredLayout())
const { reading, setReading } = useAppReading()
const editMode = ref<EditMode>(loadStoredEditMode())
const sidebarCollapsed = ref<boolean>(loadStoredSidebarCollapsed())

const docLibraryPanelRef = ref<{ expandFolder?: (id: string) => void } | null>(null)

const debouncedSource = ref<string>(activeContent.value)
const previewHost = ref<HTMLElement | null>(null)

const topError = ref<string | null>(null)
const importBanner = ref<string | null>(null)
let importBannerTimer: ReturnType<typeof setTimeout> | null = null
const floatingEditorRef = ref<InstanceType<typeof FloatingSourceEditor> | null>(null)

function showImportBanner(message: string) {
  importBanner.value = message
  if (importBannerTimer) clearTimeout(importBannerTimer)
  importBannerTimer = setTimeout(() => {
    importBanner.value = null
    importBannerTimer = null
  }, 4000)
}

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

const readingPageClass = computed(() => (reading.value === 'light' ? 'reading-light' : 'reading-dark'))

const monacoEditorTheme = computed(() => (reading.value === 'dark' ? 'vs-dark' : 'vs'))

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
  await renderMermaidBlocksIn(host, MARKDOWN_MERMAID_THEME, seq, () => pipelineSeq, {
    enterprisePreview: reading.value === 'dark' ? 'dark' : 'light',
  })
}

watch(debouncedSource, runMarkdownPipeline, { flush: 'post' })
watch(layout, (mode) => {
  persistLayout(mode)
  void nextTick(() => { window.dispatchEvent(new Event('resize')) })
})
watch(editMode, persistEditMode)
watch(sidebarCollapsed, persistSidebarCollapsed)

watch(reading, () => {
  void runMarkdownPipeline()
})

onMounted(() => {
  debouncedSource.value = activeContent.value
  void runMarkdownPipeline()
  window.addEventListener('resize', onWindowResizeDocSidebar)
  onWindowResizeDocSidebar()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResizeDocSidebar)
  document.removeEventListener('pointermove', onDocSidebarResizeMove)
  document.removeEventListener('pointerup', onDocSidebarResizeUp)
  document.removeEventListener('pointercancel', onDocSidebarResizeUp)
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
  if (debounceTimer) clearTimeout(debounceTimer)
  if (importBannerTimer) {
    clearTimeout(importBannerTimer)
    importBannerTimer = null
  }
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

async function downloadDocAsMd(id: string) {
  await lib.flush()
  const out = lib.exportDocAsMarkdown(id)
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

async function downloadActiveDocAsMd() {
  await lib.flush()
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

async function onNewRootFolder() {
  await lib.createFolder(null)
}

async function onFolderRename(id: string, newTitle: string) {
  await lib.renameFolder(id, newTitle)
}

async function onFolderDelete(id: string) {
  await lib.deleteFolder(id)
}

async function onFolderDownloadZip(id: string) {
  await lib.exportFolderAsZip(id)
}

async function onNewDocInFolder(folderId: string) {
  await lib.createEmptyDoc(folderId)
  docLibraryPanelRef.value?.expandFolder?.(folderId)
}

async function onMoveDoc(docId: string, folderId: string | null) {
  await lib.moveDocToFolder(docId, folderId)
  if (folderId) docLibraryPanelRef.value?.expandFolder?.(folderId)
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
  showImportBanner(`已导入 ${items.length} 篇文档`)
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

async function onDuplicate(id: string) {
  const dup = await lib.duplicateDoc(id)
  if (!dup) return
  showImportBanner(`已创建副本：${dup.title}`)
}
</script>

<template>
  <div
    class="editor-shell-with-sidebar"
    :style="docShellInlineStyle"
    :data-reading="reading"
    :data-sidebar-collapsed="sidebarCollapsed ? 'true' : 'false'"
  >
    <div v-if="!sidebarCollapsed" class="doc-sidebar-host">
      <DocumentLibraryPanel
        ref="docLibraryPanelRef"
        v-model:search-query="searchQuery"
        :folders="folders"
        :docs="displayPanelDocs"
        :tree-mode="treeMode"
        :has-library-items="hasLibraryItems"
        :active-id="activeId"
        :download-active-disabled="!activeId"
        @select="onSelect"
        @rename="onRename"
        @unlock-title="onUnlock"
        @delete="onDelete"
        @duplicate="onDuplicate"
        @download="downloadDocAsMd"
        @download-active="downloadActiveDocAsMd"
        @new-doc="onNewDoc"
        @new-root-folder="onNewRootFolder"
        @new-doc-in-folder="onNewDocInFolder"
        @folder-rename="onFolderRename"
        @folder-delete="onFolderDelete"
        @folder-download-zip="onFolderDownloadZip"
        @move-doc="onMoveDoc"
        @imported="onImported"
        @import-error="onImportError"
      />
      <div
        class="doc-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整文档库宽度"
        title="拖动调整文档库宽度"
        :aria-valuenow="sidebarWidthPx"
        aria-valuemin="200"
        :aria-valuemax="sidebarAriaMax"
        tabindex="0"
        @pointerdown="onDocSidebarResizeDown"
      />
    </div>

    <div class="editor-page" :class="readingPageClass">
      <div v-if="unavailableMessage" class="doc-library-banner" role="alert">
        {{ unavailableMessage }}
      </div>
      <div v-if="importBanner" class="doc-library-banner" role="status">
        {{ importBanner }}
      </div>

      <header class="toolbar">
        <button
          type="button"
          class="toolbar-toggle"
          :aria-label="sidebarCollapsed ? '展开文档库侧栏' : '收起文档库侧栏'"
          :aria-expanded="!sidebarCollapsed"
          :title="sidebarCollapsed ? '展开左侧文档库（列表与导入）' : '收起左侧文档库，扩大编辑区域'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >≡</button>
        <h1 class="doc-title" :class="{ muted: !activeDoc }">
          {{ activeDoc?.title ?? '未选中文档' }}
        </h1>
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
          <button type="button" class="ghost-btn" @click="onLoadSample">载入示例</button>
        </div>
        <div
          class="theme-group theme-group--reading-end"
          role="group"
          aria-label="全站浅色 / 深色"
        >
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
            title="深色模式（全站）"
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

      <main v-if="hasDocs" class="main" :class="`layout-${layout}`">
        <section v-show="layout !== 'preview'" class="pane editor-pane" aria-label="源码编辑">
          <h2 class="pane-title">源码</h2>
          <div class="pane-body">
            <SourceEditor
              v-if="layout === 'split' || (layout === 'code' && editMode === 'raw')"
              v-model="activeContent"
              language="markdown"
              :editor-theme="monacoEditorTheme"
            />
            <TuiEditor
              v-else-if="layout === 'code'"
              :key="activeId ?? 'no-doc'"
              v-model="activeContent"
              :chart-theme="MARKDOWN_MERMAID_THEME"
              :reading="reading"
            />
          </div>
        </section>
        <section v-show="layout !== 'code'" class="pane preview-pane" aria-label="预览">
          <h2 class="pane-title">预览</h2>
          <div v-if="topError" class="error-banner" role="alert">{{ topError }}</div>
          <div class="pane-body preview-scroll" @dblclick="onPreviewDblClick">
            <div class="markdown-preview-wrap">
              <div ref="previewHost" class="markdown-body" />
            </div>
          </div>
        </section>
      </main>

      <section v-else-if="status === 'loading'" class="doc-empty-state" aria-label="加载中">
        <p>加载文档库…</p>
      </section>

      <section v-else class="doc-empty-state" aria-label="空文档库">
        <h2>还没有文档</h2>
        <p>新建一篇空文档开始编写，或载入示例文章查看渲染效果。</p>
        <div class="doc-empty-actions">
          <button type="button" class="primary-btn" @click="onNewDoc">新建空文档</button>
          <button type="button" class="ghost-btn" @click="onLoadSample">载入示例</button>
        </div>
      </section>

      <FloatingSourceEditor
        ref="floatingEditorRef"
        v-model="activeContent"
        language="markdown"
        title="Markdown 源码编辑"
        :editor-theme="monacoEditorTheme"
      />
    </div>
  </div>
</template>

<style scoped>
.toolbar-toggle {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.toolbar-toggle:hover {
  background: rgba(15, 23, 42, 0.04);
}

[data-reading='dark'] .toolbar-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
}

.doc-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.doc-title.muted {
  color: var(--muted);
  font-weight: 500;
}

.markdown-preview-wrap {
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-height: 2rem;
}

.editor-page.reading-light {
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

.editor-page.reading-dark {
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

.editor-page.reading-dark :deep(.pane) {
  background: #111827;
  border-color: var(--md-border);
  color: var(--md-text);
}

.editor-page.reading-dark :deep(.pane-title) {
  background: #0f172a;
  border-color: var(--md-border);
  color: var(--md-muted);
}

.editor-page.reading-light :deep(.pane) {
  background: var(--surface);
  border-color: var(--border);
}

.editor-page :deep(.toolbar .theme-group--reading-end) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.4rem;
  margin-left: auto;
  justify-content: flex-end;
}

@media (max-width: 719px) {
  .editor-page :deep(.toolbar .theme-group--reading-end) {
    flex-basis: 100%;
  }
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.2rem;
  border-color: var(--md-border, var(--border));
  background: transparent;
  color: var(--md-text, var(--text));
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon:hover:not(.active)) {
  border-color: #1a1a1e;
  color: #1a1a1e;
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon.active) {
  background: #1a1a1e;
  border-color: #1a1a1e;
  color: #fafafa;
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon:focus-visible) {
  outline: 2px solid #1a1a1e;
  outline-offset: 2px;
}

/* 深色阅读：hover / 选中不用蓝紫，用中性对比 */
.editor-page.reading-dark :deep(.theme-btn.theme-btn--reading-icon:hover:not(.active)) {
  border-color: #d1d5db;
  color: #f9fafb;
}

.editor-page.reading-dark :deep(.theme-btn.theme-btn--reading-icon.active) {
  background: #f3f4f6;
  border-color: #f3f4f6;
  color: #111827;
}

.editor-page :deep(.theme-btn--reading-icon svg) {
  display: block;
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

.editor-page.reading-dark .markdown-body :deep(.mermaid-error) {
  color: #fca5a5;
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

.editor-page :deep(.toolbar) {
  border: none;
  border-bottom: 1px solid var(--md-border, var(--border));
  border-radius: 0;
  padding: 0.6rem 1rem;
  background: transparent;
}

.editor-page :deep(.hint) {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}

/* 文档库右缘拖拽调宽 */
.doc-sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
  touch-action: none;
  background: transparent;
}

.doc-sidebar-resizer:hover {
  background: rgba(99, 102, 241, 0.12);
}

[data-reading='dark'] .doc-sidebar-resizer:hover {
  background: rgba(129, 140, 248, 0.14);
}

.doc-sidebar-resizer:focus-visible {
  outline: 2px solid var(--doc-panel-active-bar, #4f46e5);
  outline-offset: -2px;
}
</style>
