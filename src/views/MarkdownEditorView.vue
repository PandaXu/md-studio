<script setup lang="ts">
import '@/styles/editor-shell.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SourceEditor from '@/components/SourceEditor.vue'
import MilkdownEditor from '@/components/MilkdownEditor.vue'
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
import DocumentLibraryPanel from '@/components/DocumentLibraryPanel.vue'
import type { DocLibraryImportPayload } from '@/components/DocumentImportMenu.vue'
import EditorHistoryButtons from '@/components/EditorHistoryButtons.vue'
import { useAppReading } from '@/composables/useAppReading'
import { useDocumentLibrary, type LibraryReorderPayload } from '@/composables/useDocumentLibrary'
import { useLocalWorkspace } from '@/composables/useLocalWorkspace'
import { useTextEditHistory } from '@/composables/useTextEditHistory'
import { useScrollSync } from '@/composables/useScrollSync'
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
  docs,
  folders,
  treeMode,
  hasLibraryItems,
  hasDocs,
} = lib

const FILE_MODE_KEY = 'markdown-editor-file-mode'

function loadStoredFileMode(): 'local' | 'web' {
  try {
    const v = localStorage.getItem(FILE_MODE_KEY)
    if (v === 'local' || v === 'web') return v
  } catch {}
  return 'web'
}
function persistFileMode(mode: 'local' | 'web') {
  try { localStorage.setItem(FILE_MODE_KEY, mode) } catch {}
}

const fileMode = ref<'local' | 'web'>(loadStoredFileMode())
const isElectron = computed(() => {
  if (typeof window === 'undefined') return false
  // preload 成功注入时优先使用
  if (window.electronAPI) return true
  // 降级：通过 User-Agent 检测（Electron 渲染进程必定包含 "Electron"）
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) return true
  return false
})

const localWs = useLocalWorkspace()

// Computed properties that pick the correct data source based on mode
const currentDocs = computed(() => fileMode.value === 'local' ? localWs.docs.value : docs.value)
const currentFolders = computed(() => fileMode.value === 'local' ? localWs.folders.value : folders.value)
const currentActiveId = computed(() => fileMode.value === 'local' ? localWs.activeId.value : activeId.value)
const currentHasItems = computed(() => fileMode.value === 'local' ? localWs.hasItems.value : hasLibraryItems.value)
const currentTreeMode = computed(() => fileMode.value === 'local' ? localWs.treeMode.value : treeMode.value)
const currentActiveContent = computed({
  get: () => fileMode.value === 'local' ? localWs.activeContent.value : activeContent.value,
  set: (v: string) => {
    if (fileMode.value === 'local') localWs.activeContent.value = v
    else activeContent.value = v
  },
})

const currentActiveDocTitle = computed(() => {
  if (fileMode.value === 'local') {
    const doc = localWs.docs.value.find((d: any) => d.id === localWs.activeId.value)
    return doc?.title ?? null
  }
  return activeDoc.value?.title ?? null
})

const currentHasContent = computed(() => {
  if (fileMode.value === 'local') return localWs.hasItems.value
  return hasDocs.value
})

// 监听本地文件冲突提醒
watch(
  () => localWs.fileConflictWarning.value,
  (msg) => {
    if (msg) showImportBanner(msg)
  },
)

// Mode switching
function switchFileMode(next: 'local' | 'web') {
  if (next === fileMode.value) return
  if (fileMode.value === 'web') lib.flush()
  else localWs.flush()
  fileMode.value = next
  persistFileMode(next)
}

async function onSelectLocalFolder() {
  if (!window.electronAPI) {
    importBanner.value = 'Preload 脚本未加载，请尝试重启应用'
    return
  }
  await localWs.openFolder()
  if (localWs.hasItems.value && !localWs.activeId.value) {
    const first = localWs.docs.value[0]
    if (first) await localWs.setActive(first.id)
  }
}

// Local mode operation proxies
async function onLocalNewDoc() {
  const folderId = localWs.activeId.value
    ? localWs.docs.value.find((d: any) => d.id === localWs.activeId.value)?.folderId ?? null
    : null
  await localWs.createDoc(folderId)
}

async function onLocalNewFolder(parentId: string | null, title: string) {
  await localWs.createFolder(parentId, title)
}

async function onLocalDelete(id: string) {
  await localWs.deleteDoc(id)
}

async function onLocalFolderDelete(id: string) {
  await localWs.deleteFolder(id)
}

async function onLocalRename(id: string, newTitle: string) {
  await localWs.renameDoc(id, newTitle)
}

async function onLocalFolderRename(id: string, newTitle: string) {
  await localWs.renameFolder(id, newTitle)
}

async function onLibraryReorder(payload: LibraryReorderPayload) {
  await lib.reorderLibraryItem(payload)
}

const {
  canUndo: canUndoEdit,
  canRedo: canRedoEdit,
  undo: applyMarkdownUndo,
  redo: applyMarkdownRedo,
  reset: resetMarkdownHistory,
} = useTextEditHistory(currentActiveContent, { debounceMs: 320 })

const layout = ref<LayoutMode>(loadStoredLayout())
const { reading, setReading } = useAppReading()
const editMode = ref<EditMode>(loadStoredEditMode())
const sidebarCollapsed = ref<boolean>(loadStoredSidebarCollapsed())

const docLibraryPanelRef = ref<{ expandFolder?: (id: string) => void } | null>(null)

const debouncedSource = ref<string>(currentActiveContent.value)
const previewHost = ref<HTMLElement | null>(null)
const previewScrollEl = ref<HTMLElement | null>(null)
const sourceEditorRef = ref<InstanceType<typeof SourceEditor> | null>(null)

// 滚动同步：仅左右并列视图启用
const isScrollSyncActive = computed(() => layout.value === 'split')
const scrollSync = useScrollSync(
  (onScroll) => {
    const ed = sourceEditorRef.value?.getEditor()
    if (!ed) return () => {}
    const disposable = ed.onDidScrollChange(() => {
      const scrollTop = ed.getScrollTop()
      const scrollHeight = ed.getScrollHeight()
      const layoutInfo = ed.getLayoutInfo()
      const clientHeight = layoutInfo?.height ?? 0
      if (scrollHeight <= 0 || clientHeight <= 0) return
      onScroll({ scrollTop, scrollHeight, clientHeight })
    })
    return () => disposable.dispose()
  },
  previewScrollEl,
  isScrollSyncActive,
)

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

function flushMarkdownDebouncedSource() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  debouncedSource.value = currentActiveContent.value
}

function onMarkdownHistoryUndo() {
  applyMarkdownUndo()
  flushMarkdownDebouncedSource()
}

function onMarkdownHistoryRedo() {
  applyMarkdownRedo()
  flushMarkdownDebouncedSource()
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pipelineSeq = 0

function debounceSourceUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    debouncedSource.value = currentActiveContent.value
  }, 320)
}

watch(currentActiveContent, debounceSourceUpdate, { flush: 'post' })
watch(currentActiveId, () => {
  resetMarkdownHistory(currentActiveContent.value)
  debouncedSource.value = currentActiveContent.value
  void nextTick(() => {
    const host = previewHost.value
    if (host) host.scrollTop = 0
  })
})

const readingPageClass = computed(() => (reading.value === 'light' ? 'reading-light' : 'reading-dark'))

const monacoEditorTheme = computed(() => (reading.value === 'dark' ? 'vs-dark' : 'vs'))

// 当前文件类型检测
const isHtmlFile = computed(() => /\.html$/i.test(currentActiveId.value ?? ''))
const currentEditorLanguage = computed(() => isHtmlFile.value ? 'html' : 'markdown')

function setEditMode(next: EditMode) { editMode.value = next; persistEditMode(next) }

async function runMarkdownPipeline() {
  const seq = ++pipelineSeq
  const host = previewHost.value
  if (!host) return

  if (isHtmlFile.value) {
    // HTML 文件：直接消毒渲染，跳过 Markdown 转换
    let clean: string
    try {
      clean = sanitizeMarkdownHtml(debouncedSource.value)
    } catch (e) {
      if (seq !== pipelineSeq) return
      topError.value = e instanceof Error ? e.message : String(e)
      return
    }
    if (seq !== pipelineSeq) return
    topError.value = null
    host.innerHTML = clean
    return
  }

  // Markdown 文件：走完整渲染管线
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
  void nextTick(() => {
    window.dispatchEvent(new Event('resize'))
    scrollSync.reconnect()
  })
})
watch(editMode, persistEditMode)
watch(sidebarCollapsed, persistSidebarCollapsed)

watch(reading, () => {
  void runMarkdownPipeline()
})

onMounted(() => {
  debouncedSource.value = currentActiveContent.value
  void runMarkdownPipeline()
  window.addEventListener('resize', onWindowResizeDocSidebar)
  onWindowResizeDocSidebar()
  // Connect scroll sync once SourceEditor ref is ready
  const stopWatch = watch(sourceEditorRef, (ref) => {
    if (ref) {
      void nextTick(() => { scrollSync.connect() })
      stopWatch()
    }
  }, { immediate: true })
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
body{margin:0;padding:1.25rem;font-family:-apple-system,'SF Pro Display',sans-serif;background:#fff;color:#37352f;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid rgba(0,0,0,0.08);padding:0.35rem 0.5rem;}
.md-export pre{background:#f7f6f3;padding:0.75rem;border-radius:4px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#e5484d;font-size:0.875rem;}
`
const EXPORT_CSS_DARK = `
body{margin:0;padding:1.25rem;font-family:-apple-system,'SF Pro Display',sans-serif;background:#191919;color:#e6e6e6;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid rgba(255,255,255,0.06);padding:0.35rem 0.5rem;}
.md-export pre{background:#202020;padding:0.75rem;border-radius:4px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#f87171;font-size:0.875rem;}
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

async function onNewFolder(parentId: string | null, title: string) {
  const folder = await lib.createFolder(parentId, title)
  docLibraryPanelRef.value?.expandFolder?.(folder.id)
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

async function onMoveFolderInto(folderId: string, targetFolderId: string) {
  await lib.moveFolderIntoFolder(folderId, targetFolderId)
  docLibraryPanelRef.value?.expandFolder?.(targetFolderId)
}

async function onImported(payload: DocLibraryImportPayload) {
  const { items, folderId } = payload
  if (!items.length) return

  const pathCache = new Map<string, string>()
  const baseKey = folderId ?? '__root__'

  async function resolveTargetFolder(segments: string[] | undefined): Promise<string | null> {
    const segs = (segments ?? []).filter((s) => s && s !== '.' && s !== '..')
    let parentId: string | null = folderId ?? null
    for (let i = 0; i < segs.length; i++) {
      const subpath = segs.slice(0, i + 1).join('/')
      const cacheKey = `${baseKey}::${subpath}`
      const cached = pathCache.get(cacheKey)
      if (cached) {
        parentId = cached
        continue
      }
      const title = segs[i]
      const existing = folders.value.find((f) => f.parentId === parentId && f.title === title)
      const fid = existing ? existing.id : (await lib.createFolder(parentId, title)).id
      pathCache.set(cacheKey, fid)
      parentId = fid
    }
    return parentId
  }

  let firstId: string | null = null
  for (const it of items) {
    const targetFolderId = await resolveTargetFolder(it.folderSegments)
    const doc = await lib.createDocFromContent(it.content, {
      title: it.title,
      titleLocked: it.titleLocked,
      folderId: targetFolderId ?? undefined,
    })
    if (!firstId) firstId = doc.id
  }
  if (firstId) await lib.setActive(firstId)
  if (folderId) docLibraryPanelRef.value?.expandFolder?.(folderId)
  for (const fid of pathCache.values()) {
    docLibraryPanelRef.value?.expandFolder?.(fid)
  }
  const hasSubdirs = items.some((it) => (it.folderSegments?.length ?? 0) > 0)
  showImportBanner(
    hasSubdirs
      ? folderId
        ? `已导入 ${items.length} 篇文档到当前文件夹（已保持子目录）`
        : `已导入 ${items.length} 篇文档（已保持子目录）`
      : folderId
        ? `已导入 ${items.length} 篇文档到当前文件夹`
        : `已导入 ${items.length} 篇文档`,
  )
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
        :file-mode="fileMode"
        :workspace-path="localWs.workspacePath.value"
        :is-electron="isElectron"
        :folders="currentFolders"
        :docs="currentDocs"
        :tree-mode="currentTreeMode"
        :has-library-items="currentHasItems"
        :active-id="currentActiveId"
        :download-active-disabled="!currentActiveId"
        @update:file-mode="switchFileMode"
        @select-local-folder="onSelectLocalFolder"
        @close-local-workspace="(async () => { await localWs.closeWorkspace() })()"
        @select="(id: string) => fileMode === 'local' ? localWs.setActive(id) : onSelect(id)"
        @rename="(id: string, t: string) => fileMode === 'local' ? onLocalRename(id, t) : onRename(id, t)"
        @unlock-title="onUnlock"
        @delete="(id: string) => fileMode === 'local' ? onLocalDelete(id) : onDelete(id)"
        @duplicate="onDuplicate"
        @download="downloadDocAsMd"
        @download-active="downloadActiveDocAsMd"
        @new-doc="fileMode === 'local' ? onLocalNewDoc() : onNewDoc()"
        @new-folder="(pid: string | null, t: string) => fileMode === 'local' ? onLocalNewFolder(pid, t) : onNewFolder(pid, t)"
        @new-doc-in-folder="onNewDocInFolder"
        @folder-rename="(id: string, t: string) => fileMode === 'local' ? onLocalFolderRename(id, t) : onFolderRename(id, t)"
        @folder-delete="(id: string) => fileMode === 'local' ? onLocalFolderDelete(id) : onFolderDelete(id)"
        @folder-download-zip="onFolderDownloadZip"
        @move-doc="onMoveDoc"
        @move-folder-into="onMoveFolderInto"
        @reorder-library="onLibraryReorder"
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
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 class="doc-title" :class="{ muted: !currentActiveDocTitle }">
          {{ currentActiveDocTitle ?? '未选中文档' }}
        </h1>
        <div v-if="layout === 'code'" class="theme-group" role="group" aria-label="编辑模式">
          <span class="theme-label">编辑模式</span>
          <button type="button" class="theme-btn" :class="{ active: editMode === 'raw' }"
            :aria-pressed="editMode === 'raw'" @click="setEditMode('raw')">Raw</button>
          <button type="button" class="theme-btn" :class="{ active: editMode === 'wysiwyg' }"
            :aria-pressed="editMode === 'wysiwyg'" @click="setEditMode('wysiwyg')">WYSIWYG</button>
        </div>
        <div class="toolbar-actions">
          <EditorHistoryButtons
            v-if="currentHasContent"
            :can-undo="canUndoEdit"
            :can-redo="canRedoEdit"
            @undo="onMarkdownHistoryUndo"
            @redo="onMarkdownHistoryRedo"
          />
          <label class="field-inline">
            <span class="field-label">视图布局</span>
            <select v-model="layout" class="select" aria-label="视图布局">
              <option v-for="o in LAYOUT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" @click="exportHtml">下载 HTML</button>
          <button v-if="fileMode === 'web'" type="button" class="ghost-btn" @click="onLoadSample">载入示例</button>
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

      <main v-if="currentHasContent" class="main" :class="`layout-${layout}`">
        <section v-show="layout !== 'preview'" class="pane editor-pane" aria-label="源码编辑">
          <h2 class="pane-title">源码</h2>
          <div class="pane-body">
            <SourceEditor
              ref="sourceEditorRef"
              v-if="layout === 'split' || (layout === 'code' && editMode === 'raw')"
              v-model="currentActiveContent"
              :language="currentEditorLanguage"
              :editor-theme="monacoEditorTheme"
            />
            <MilkdownEditor
              v-else-if="layout === 'code'"
              :key="(currentActiveId ?? 'no-doc') + '-' + fileMode"
              v-model="currentActiveContent"
              :reading="reading"
            />
          </div>
        </section>
        <section v-show="layout !== 'code'" class="pane preview-pane" aria-label="预览">
          <h2 class="pane-title">预览</h2>
          <div v-if="topError" class="error-banner" role="alert">{{ topError }}</div>
          <div ref="previewScrollEl" class="pane-body preview-scroll" @dblclick="onPreviewDblClick">
            <div class="markdown-preview-wrap">
              <div ref="previewHost" class="markdown-body" />
            </div>
          </div>
        </section>
      </main>

      <section v-else-if="status === 'loading' && fileMode === 'web'" class="doc-empty-state" aria-label="加载中">
        <p>加载文档库…</p>
      </section>

      <section v-else-if="fileMode === 'local' && !localWs.hasWorkspace.value" class="doc-empty-state" aria-label="本地模式">
        <h2>本地文件模式</h2>
        <p>打开本地文件夹，直接编辑和预览 Markdown 文件。</p>
      </section>

      <section v-else-if="fileMode === 'local' && localWs.hasWorkspace.value" class="doc-empty-state" aria-label="空文件夹">
        <h2>{{ localWs.workspacePath.value?.split('/').pop() ?? '文件夹' }} 中没有 Markdown 文件</h2>
        <p>点击工具栏 ＋ 新建文档，或在 Finder 中添加 .md 文件。</p>
        <div class="doc-empty-actions">
          <button type="button" class="primary-btn" @click="onLocalNewDoc()">新建空文档</button>
        </div>
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
        v-model="currentActiveContent"
        language="markdown"
        title="Markdown 源码编辑"
        :editor-theme="monacoEditorTheme"
      />
    </div>
  </div>
</template>

<style scoped>
.toolbar-toggle {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.toolbar-toggle:hover {
  background: var(--doc-panel-hover);
  color: var(--text);
}

.toolbar-toggle svg {
  display: block;
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
  font-weight: 400;
}

.markdown-preview-wrap {
  border-radius: 0;
  padding: 0.75rem 1rem;
  min-height: 2rem;
}

.editor-page.reading-light {
  --md-text: #37352f;
  --md-muted: #9b9a97;
  --md-bg: #ffffff;
  --md-border: rgba(0, 0, 0, 0.08);
  --md-code-bg: #f7f6f3;
  --md-line-height: 1.7;
  --md-heading-line: 1.28;
  background: var(--md-bg);
  color: var(--md-text);
}

.editor-page.reading-dark {
  --md-text: #e6e6e6;
  --md-muted: #9b9b9b;
  --md-bg: #191919;
  --md-border: rgba(255, 255, 255, 0.06);
  --md-code-bg: #202020;
  --md-line-height: 1.72;
  --md-heading-line: 1.3;
  background: var(--md-bg);
  color: var(--md-text);
}

.editor-page.reading-dark :deep(.pane) {
  background: #202020;
  border-color: var(--md-border);
  color: var(--md-text);
}

.editor-page.reading-dark :deep(.pane-title) {
  background: transparent;
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
  gap: 0.3rem;
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
  min-width: 1.75rem;
  min-height: 1.75rem;
  padding: 0.15rem;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon:hover) {
  background: var(--doc-panel-hover);
  color: var(--text);
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon.active) {
  background: transparent;
  border-color: transparent;
  color: var(--text);
}

.editor-page :deep(.theme-btn.theme-btn--reading-icon:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.editor-page :deep(.theme-btn--reading-icon svg) {
  display: block;
}

.markdown-body {
  font-size: 0.9375rem;
  line-height: var(--md-line-height, 1.7);
}

.markdown-body :deep(h1) {
  margin: 0 0 0.5rem;
  padding-bottom: 0.25rem;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: var(--md-heading-line, 1.28);
  border-bottom: 1px solid var(--md-border);
}

.markdown-body :deep(h2) {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 600;
  line-height: var(--md-heading-line, 1.28);
}

.markdown-body :deep(h2:first-child),
.markdown-body :deep(h1 + h2) {
  margin-top: 0.25rem;
}

.markdown-body :deep(h3) {
  margin: 1.25rem 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: var(--md-heading-line, 1.28);
}

.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1rem 0 0.35rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: var(--md-heading-line, 1.28);
  color: var(--md-text);
}

.markdown-body :deep(p) {
  margin: 0 0 0.5rem;
  line-height: inherit;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(a) {
  color: var(--accent);
}

.markdown-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding: 0.25rem 0 0.25rem 0.8rem;
  border-left: 3px solid var(--md-border);
  color: var(--md-muted);
  line-height: inherit;
}

.markdown-body :deep(blockquote p) {
  margin: 0.25rem 0;
}

.markdown-body :deep(hr) {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid var(--md-border);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--md-border);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}

.markdown-body :deep(th) {
  font-weight: 600;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.35rem;
  line-height: inherit;
}

.markdown-body :deep(li) {
  margin: 0.15rem 0;
  padding-left: 0.1rem;
}

.markdown-body :deep(li > p) {
  margin: 0.25rem 0;
}

.markdown-body :deep(ul ul),
.markdown-body :deep(ol ol),
.markdown-body :deep(ul ol),
.markdown-body :deep(ol ul) {
  margin: 0.2rem 0 0.3rem;
}

.markdown-body :deep(pre) {
  margin: 0.5rem 0;
  background: var(--md-code-bg);
  padding: 0.75rem 0.85rem;
  border-radius: 4px;
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
  padding: 0.1em 0.35em;
  border-radius: 3px;
  background: var(--md-code-bg);
  font-size: 0.88em;
  color: #e5484d;
}

.markdown-body :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
  color: inherit;
}

.markdown-body :deep(.mermaid-block) {
  margin: 0.75rem 0;
}

.markdown-body :deep(details.mermaid-source-details) {
  margin: 0 0 0.35rem;
  border: 1px solid var(--md-border);
  border-radius: 4px;
  background: var(--md-code-bg);
  overflow: hidden;
}

.markdown-body :deep(summary.mermaid-source-summary) {
  cursor: pointer;
  padding: 0.35rem 0.55rem;
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--md-muted);
  user-select: none;
  list-style-position: outside;
}

.markdown-body :deep(summary.mermaid-source-summary:hover) {
  color: var(--md-text);
}

.markdown-body :deep(details.mermaid-source-details pre.mermaid-source) {
  margin: 0;
  border-top: 1px solid var(--md-border);
  border-radius: 0 0 4px 4px;
}

.markdown-body :deep(.mermaid-error) {
  font-size: 0.8125rem;
  color: var(--error-text);
  white-space: pre-wrap;
}

.doc-empty-state {
  margin-top: 2rem;
  padding: 2rem 1.5rem;
  text-align: center;
  color: var(--text);
}
.doc-empty-state h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
  font-weight: 600;
}
.doc-empty-state p {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.875rem;
}
.doc-empty-actions {
  display: flex;
  gap: 0.4rem;
  justify-content: center;
}

.editor-page :deep(.toolbar) {
  position: sticky;
  top: 0;
  z-index: 10;
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0.5rem 0;
  background: var(--bg);
}

.editor-page :deep(.hint) {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}

.doc-sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
  touch-action: none;
  background: transparent;
}

.doc-sidebar-resizer:hover {
  background: var(--doc-panel-border);
}

.doc-sidebar-resizer:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
</style>
