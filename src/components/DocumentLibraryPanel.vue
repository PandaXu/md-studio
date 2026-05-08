<!-- src/components/DocumentLibraryPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Doc, FolderRecord } from '@/markdown/documentStore'
import DocumentImportMenu, { type DocLibraryImportPayload } from '@/components/DocumentImportMenu.vue'
import AppModeNav from '@/components/AppModeNav.vue'
import FolderOutlineIcon from '@/components/icons/FolderOutlineIcon.vue'

type CtxTarget = { kind: 'doc'; id: string } | { kind: 'folder'; id: string }

type CtxMenuState = { target: CtxTarget; mode: 'cursor'; x: number; y: number } | { target: CtxTarget; mode: 'kebab' }

type TreeRow =
  | { row: 'folder'; folder: FolderRecord; depth: number }
  | { row: 'doc'; doc: Doc; depth: number }
  | { row: 'empty'; folderId: string; depth: number }
  | { row: 'no-folder-divider' }
  | { row: 'root-drop' }

const props = defineProps<{
  folders: readonly FolderRecord[]
  docs: readonly Doc[]
  activeId: string | null
  searchQuery: string
  hasLibraryItems: boolean
  treeMode: boolean
  downloadActiveDisabled: boolean
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  select: [id: string]
  rename: [id: string, newTitle: string]
  unlockTitle: [id: string]
  delete: [id: string]
  duplicate: [id: string]
  download: [id: string]
  downloadActive: []
  newDoc: []
  newDocInFolder: [folderId: string]
  folderRename: [id: string, newTitle: string]
  folderDelete: [id: string]
  folderDownloadZip: [id: string]
  moveDoc: [docId: string, folderId: string | null]
  imported: [payload: DocLibraryImportPayload]
  importError: [message: string]
  newRootFolder: [title: string]
}>()

const importMenuRef = ref<InstanceType<typeof DocumentImportMenu> | null>(null)

const newFolderDialogOpen = ref(false)
const newFolderNameDraft = ref('')
const newFolderErr = ref<string | null>(null)
const newFolderInputRef = ref<HTMLInputElement | null>(null)

function openNewFolderDialog() {
  newFolderNameDraft.value = ''
  newFolderErr.value = null
  newFolderDialogOpen.value = true
  void nextTick(() => {
    newFolderInputRef.value?.focus()
  })
}

function cancelNewFolderDialog() {
  newFolderDialogOpen.value = false
  newFolderErr.value = null
}

function confirmNewFolderDialog() {
  const t = newFolderNameDraft.value.replace(/\s+/g, ' ').trim()
  if (!t) {
    newFolderErr.value = '请输入文件夹名称'
    return
  }
  newFolderDialogOpen.value = false
  newFolderErr.value = null
  emit('newRootFolder', t)
}

const FOLDER_EXPANDED_KEY = 'markdown-editor-library-folder-expanded'

const renamingId = ref<string | null>(null)
const renamingDraft = ref<string>('')
const renamingFolderId = ref<string | null>(null)
const renamingFolderDraft = ref<string>('')
let renameInputEl: HTMLInputElement | null = null
let renameFolderInputEl: HTMLInputElement | null = null

function loadFolderExpandedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(FOLDER_EXPANDED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function persistFolderExpandedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(FOLDER_EXPANDED_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

const expanded = ref<Record<string, boolean>>(loadFolderExpandedState())

const DRAG_DOC_MIME = 'application/x-md-studio-doc-id'

/** 正在拖拽的文档 id（dragover 阶段部分浏览器无法读 dataTransfer） */
const dragDocId = ref<string | null>(null)
/** 当前高亮的放置区：文件夹 id 或 'root' */
const dropHighlight = ref<string | null>(null)

function bindRenameInput(el: unknown) {
  renameInputEl = el instanceof HTMLInputElement ? el : null
}

function bindFolderRenameInput(el: unknown) {
  renameFolderInputEl = el instanceof HTMLInputElement ? el : null
}

function isFolderExpanded(id: string): boolean {
  return !!expanded.value[id]
}

function setFolderExpandedState(next: Record<string, boolean>) {
  expanded.value = next
  persistFolderExpandedState(next)
}

function toggleFolderExpand(id: string) {
  setFolderExpandedState({ ...expanded.value, [id]: !isFolderExpanded(id) })
}

/** 树内文档行左侧缩进：根目录文档较浅；位于文件夹内时加大缩进以区分层级 */
function docRowPaddingLeftRem(depth: number): string {
  if (depth <= 0) return `${0.55 + depth * 0.75}rem`
  return `${0.72 + depth * 1.18}rem`
}

const treeRows = computed<TreeRow[]>(() => {
  if (!props.treeMode) return []
  const rows: TreeRow[] = []
  const fList = [...props.folders]
  const dList = [...props.docs]
  const validFolderIds = new Set(fList.map((f) => f.id))

  function effectiveParentId(doc: Doc): string | null {
    const fid = doc.folderId ?? null
    if (!fid || !validFolderIds.has(fid)) return null
    return fid
  }

  const childFolders = (pid: string | null) =>
    fList.filter((f) => f.parentId === pid).sort((a, b) => b.updatedAt - a.updatedAt)
  const childDocs = (pid: string | null) =>
    dList.filter((d) => effectiveParentId(d) === pid).sort((a, b) => b.updatedAt - a.updatedAt)

  function walkFolder(folder: FolderRecord, depth: number) {
    rows.push({ row: 'folder', folder, depth })
    if (!isFolderExpanded(folder.id)) return
    const cfs = childFolders(folder.id)
    const cds = childDocs(folder.id)
    if (cfs.length === 0 && cds.length === 0) {
      rows.push({ row: 'empty', folderId: folder.id, depth: depth + 1 })
      return
    }
    for (const cf of cfs) walkFolder(cf, depth + 1)
    for (const d of cds) rows.push({ row: 'doc', doc: d, depth: depth + 1 })
  }

  const rootFolders = childFolders(null)
  const rootDocsList = childDocs(null)
  const docInNestedFolder = dList.some((d) => effectiveParentId(d) !== null)

  for (const rf of rootFolders) walkFolder(rf, 0)
  if (rootFolders.length > 0 && rootDocsList.length > 0) {
    rows.push({ row: 'no-folder-divider' })
  } else if (rootDocsList.length > 0 && docInNestedFolder && rootFolders.length === 0) {
    rows.push({ row: 'root-drop' })
  }
  for (const d of rootDocsList) rows.push({ row: 'doc', doc: d, depth: 0 })
  return rows
})

function startRename(doc: Doc) {
  renamingId.value = doc.id
  renamingDraft.value = doc.title
  void nextTick(() => {
    renameInputEl?.focus()
    renameInputEl?.select()
  })
}

function startRenameFolder(folder: FolderRecord) {
  renamingFolderId.value = folder.id
  renamingFolderDraft.value = folder.title
  void nextTick(() => {
    renameFolderInputEl?.focus()
    renameFolderInputEl?.select()
  })
}

function commitRename() {
  if (!renamingId.value) return
  const raw = renameInputEl?.value ?? renamingDraft.value
  emit('rename', renamingId.value, raw)
  renamingId.value = null
  renamingDraft.value = ''
}

function commitFolderRename() {
  if (!renamingFolderId.value) return
  const raw = renameFolderInputEl?.value ?? renamingFolderDraft.value
  emit('folderRename', renamingFolderId.value, raw)
  renamingFolderId.value = null
  renamingFolderDraft.value = ''
}

function cancelRename() {
  renamingId.value = null
  renamingDraft.value = ''
}

function cancelFolderRename() {
  renamingFolderId.value = null
  renamingFolderDraft.value = ''
}

function onItemClick(doc: Doc) {
  if (renamingId.value === doc.id) return
  emit('select', doc.id)
}

function onItemDblClick(doc: Doc) {
  startRename(doc)
}

function openContextMenu(ev: MouseEvent, doc: Doc) {
  ev.preventDefault()
  ctxMenu.value = { target: { kind: 'doc', id: doc.id }, mode: 'cursor', x: ev.clientX, y: ev.clientY }
}

function openFolderContextMenu(ev: MouseEvent, folder: FolderRecord) {
  ev.preventDefault()
  ctxMenu.value = { target: { kind: 'folder', id: folder.id }, mode: 'cursor', x: ev.clientX, y: ev.clientY }
}

function openKebabMenuDoc(doc: Doc) {
  const t: CtxTarget = { kind: 'doc', id: doc.id }
  if (ctxMenu.value && sameTarget(ctxMenu.value.target, t) && ctxMenu.value.mode === 'kebab') {
    closeContextMenu()
    return
  }
  ctxMenu.value = { target: t, mode: 'kebab' }
}

function openKebabMenuFolder(folder: FolderRecord) {
  const t: CtxTarget = { kind: 'folder', id: folder.id }
  if (ctxMenu.value && sameTarget(ctxMenu.value.target, t) && ctxMenu.value.mode === 'kebab') {
    closeContextMenu()
    return
  }
  ctxMenu.value = { target: t, mode: 'kebab' }
}

function sameTarget(a: CtxTarget, b: CtxTarget): boolean {
  return a.kind === b.kind && a.id === b.id
}

const ctxMenu = ref<CtxMenuState | null>(null)
const ctxMenuEl = ref<HTMLElement | null>(null)

function closeContextMenu() {
  ctxMenu.value = null
}

function onGlobalCtxPointerDown(ev: PointerEvent) {
  if (!ctxMenu.value) return
  if (ev.button !== 0 && ev.pointerType === 'mouse') return
  const t = ev.target as HTMLElement | null
  const id = ctxMenu.value.target.id
  const kind = ctxMenu.value.target.kind
  if (
    ctxMenu.value.mode === 'kebab' &&
    t?.closest('.doc-panel-kebab')?.getAttribute('data-kebab-kind') === kind &&
    t?.closest('.doc-panel-kebab')?.getAttribute('data-kebab-id') === id
  ) {
    return
  }
  const refVal = ctxMenuEl.value as HTMLElement | HTMLElement[] | null
  const root = Array.isArray(refVal) ? (refVal[0] ?? null) : refVal
  if (root && t && !root.contains(t)) closeContextMenu()
}

function onGlobalCtxKeydown(ev: KeyboardEvent) {
  if (!ctxMenu.value) return
  if (ev.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalCtxPointerDown, true)
  document.addEventListener('keydown', onGlobalCtxKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalCtxPointerDown, true)
  document.removeEventListener('keydown', onGlobalCtxKeydown)
})

const ctxDoc = computed(() => {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'doc') return null
  return props.docs.find((d) => d.id === ctxMenu.value!.target.id) ?? null
})

const ctxFolder = computed(() => {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return null
  return props.folders.find((f) => f.id === ctxMenu.value!.target.id) ?? null
})

const ctxLockedOnly = computed(() => ctxDoc.value?.titleLocked ?? false)

function onCtxRenameDoc() {
  const doc = ctxDoc.value
  closeContextMenu()
  if (doc) startRename(doc)
}

function onCtxRenameFolder() {
  const folder = ctxFolder.value
  closeContextMenu()
  if (folder) startRenameFolder(folder)
}

function onCtxUnlock() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'doc') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  emit('unlockTitle', id)
}

function onCtxDownload() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'doc') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  emit('download', id)
}

function onCtxDuplicate() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'doc') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  emit('duplicate', id)
}

function onCtxDeleteDoc() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'doc') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  if (window.confirm('确定删除该文档吗？此操作不可撤销。')) {
    emit('delete', id)
  }
}

function onCtxNewDocInFolder() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  setFolderExpandedState({ ...expanded.value, [id]: true })
  emit('newDocInFolder', id)
}

function onCtxFolderImportMd() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  importMenuRef.value?.openLocalPickerForFolder(id)
}

function onCtxFolderDownloadZip() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  emit('folderDownloadZip', id)
}

function onCtxDeleteFolder() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  if (window.confirm('确定删除该文件夹及其中的全部文档吗？此操作不可撤销。')) {
    emit('folderDelete', id)
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - ts
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.getFullYear() === now.getFullYear()) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

watch(
  () => props.activeId,
  () => {
    closeContextMenu()
  },
)

watch(
  () => props.treeMode,
  () => {
    closeContextMenu()
  },
)

function onSearchInput(ev: Event) {
  emit('update:searchQuery', (ev.target as HTMLInputElement).value)
}

function onClearSearch() {
  emit('update:searchQuery', '')
}

function onFolderRowClick(ev: MouseEvent, folder: FolderRecord) {
  const t = ev.target as HTMLElement | null
  if (t?.closest('.doc-panel-folder-chevron')) {
    toggleFolderExpand(folder.id)
    return
  }
  if (t?.closest('.doc-panel-kebab')) return
  if (renamingFolderId.value === folder.id) return
  toggleFolderExpand(folder.id)
}

function ctxMenuOpenForDoc(docId: string, mode: 'cursor' | 'kebab'): boolean {
  return !!(
    ctxMenu.value &&
    ctxMenu.value.target.kind === 'doc' &&
    ctxMenu.value.target.id === docId &&
    ctxMenu.value.mode === mode
  )
}

function ctxMenuOpenForFolder(folderId: string, mode: 'cursor' | 'kebab'): boolean {
  return !!(
    ctxMenu.value &&
    ctxMenu.value.target.kind === 'folder' &&
    ctxMenu.value.target.id === folderId &&
    ctxMenu.value.mode === mode
  )
}

function readDragDocId(dt: DataTransfer | null): string | null {
  if (!dt) return null
  const a = dt.getData(DRAG_DOC_MIME).trim()
  if (a) return a
  const b = dt.getData('text/plain').trim()
  return b || null
}

function onDocDragStart(doc: Doc, ev: DragEvent) {
  if (!props.treeMode || renamingId.value === doc.id) {
    ev.preventDefault()
    return
  }
  dragDocId.value = doc.id
  ev.dataTransfer?.setData(DRAG_DOC_MIME, doc.id)
  ev.dataTransfer?.setData('text/plain', doc.id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}

function onDocDragEnd() {
  dragDocId.value = null
  dropHighlight.value = null
}

function onFolderDragOver(ev: DragEvent, folderId: string) {
  if (!props.treeMode || !dragDocId.value) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dropHighlight.value = folderId
}

function onFolderDragLeave(ev: DragEvent, folderId: string) {
  const cur = ev.currentTarget as HTMLElement
  const rel = ev.relatedTarget as Node | null
  if (rel && cur.contains(rel)) return
  if (dropHighlight.value === folderId) dropHighlight.value = null
}

function onRootDropZoneDragOver(ev: DragEvent) {
  if (!props.treeMode || !dragDocId.value) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dropHighlight.value = 'root'
}

function onRootDropZoneDragLeave(ev: DragEvent) {
  const cur = ev.currentTarget as HTMLElement
  const rel = ev.relatedTarget as Node | null
  if (rel && cur.contains(rel)) return
  if (dropHighlight.value === 'root') dropHighlight.value = null
}

function onFolderDrop(ev: DragEvent, folderId: string) {
  ev.preventDefault()
  const id = dragDocId.value ?? readDragDocId(ev.dataTransfer)
  onDocDragEnd()
  if (!id) return
  emit('moveDoc', id, folderId)
}

function onRootDrop(ev: DragEvent) {
  ev.preventDefault()
  const id = dragDocId.value ?? readDragDocId(ev.dataTransfer)
  onDocDragEnd()
  if (!id) return
  emit('moveDoc', id, null)
}

function expandFolder(id: string) {
  if (!isFolderExpanded(id)) {
    setFolderExpandedState({ ...expanded.value, [id]: true })
  }
}

defineExpose({ expandFolder })
</script>

<template>
  <aside class="doc-panel" aria-label="Documents">
    <header class="doc-panel-header">
      <div class="doc-panel-toolbar-icons">
        <AppModeNav class="doc-panel-toolbar-mode" />
        <DocumentImportMenu
          ref="importMenuRef"
          menu-id="doc-library-import"
          @imported="(p) => emit('imported', p)"
          @error="(msg) => emit('importError', msg)"
        />
        <button
          type="button"
          class="doc-toolbar-icon-btn"
          :disabled="downloadActiveDisabled"
          :aria-disabled="downloadActiveDisabled || undefined"
          :title="
            downloadActiveDisabled
              ? 'Select a document first'
              : 'Export current document as Markdown (.md)'
          "
          :aria-label="
            downloadActiveDisabled
              ? 'Export Markdown (select a document first)'
              : 'Export current document as Markdown'
          "
          @click="emit('downloadActive')"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          type="button"
          class="doc-toolbar-icon-btn"
          title="新建文件夹"
          aria-label="新建文件夹"
          @click="openNewFolderDialog"
        >
          <FolderOutlineIcon class="doc-toolbar-icon-inner" :size="14" />
        </button>
        <button
          type="button"
          class="doc-toolbar-icon-btn doc-toolbar-icon-btn--primary"
          title="New Document"
          aria-label="新建空文档"
          @click="emit('newDoc')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </header>

    <div class="doc-panel-search">
      <input
        type="search"
        class="doc-panel-search-input"
        placeholder="Search documents..."
        :value="searchQuery"
        aria-label="搜索文档"
        @input="onSearchInput"
      />
      <button
        v-if="searchQuery"
        type="button"
        class="doc-panel-search-clear"
        title="清空搜索条件"
        aria-label="清空搜索"
        @click="onClearSearch"
      >×</button>
    </div>

    <template v-if="treeMode">
      <ul v-if="treeRows.length" class="doc-panel-list doc-panel-list--tree" role="list">
        <template
          v-for="(row, idx) in treeRows"
          :key="row.row === 'doc' ? row.doc.id : row.row === 'folder' ? row.folder.id : row.row === 'no-folder-divider' ? 'no-folder-divider' : row.row === 'root-drop' ? 'root-drop' : `e-${row.folderId}-${idx}`"
        >
          <li
            v-if="row.row === 'folder'"
            class="doc-panel-folder"
            :class="{
              'menu-open': ctxMenuOpenForFolder(row.folder.id, 'kebab'),
              'doc-panel-drag-over': dropHighlight === row.folder.id,
            }"
            role="none"
            :style="{ paddingLeft: `${0.55 + row.depth * 0.75}rem` }"
            @click="onFolderRowClick($event, row.folder)"
            @contextmenu="openFolderContextMenu($event, row.folder)"
            @dragover="onFolderDragOver($event, row.folder.id)"
            @dragleave="onFolderDragLeave($event, row.folder.id)"
            @drop="onFolderDrop($event, row.folder.id)"
          >
            <button
              type="button"
              class="doc-panel-folder-chevron"
              :aria-expanded="isFolderExpanded(row.folder.id)"
              :title="isFolderExpanded(row.folder.id) ? '折叠子列表' : '展开查看文件夹内文档'"
              :aria-label="isFolderExpanded(row.folder.id) ? '折叠文件夹' : '展开文件夹'"
              @click.stop="toggleFolderExpand(row.folder.id)"
            >
              {{ isFolderExpanded(row.folder.id) ? '▾' : '▸' }}
            </button>
            <span class="doc-panel-folder-icon" aria-hidden="true">
              <FolderOutlineIcon :size="14" />
            </span>
            <input
              v-if="renamingFolderId === row.folder.id"
              :ref="bindFolderRenameInput"
              v-model="renamingFolderDraft"
              class="doc-panel-rename-input doc-panel-folder-rename"
              type="text"
              @keydown.enter.prevent="commitFolderRename"
              @keydown.escape.prevent="cancelFolderRename"
              @blur="commitFolderRename"
              @click.stop
            />
            <span v-else class="doc-panel-folder-title" :title="row.folder.title">{{ row.folder.title }}</span>
            <button
              v-if="renamingFolderId !== row.folder.id"
              type="button"
              class="doc-panel-kebab doc-panel-kebab--folder"
              :data-kebab-kind="'folder'"
              :data-kebab-id="row.folder.id"
              :title="`${row.folder.title}：更多操作（新建、上传、下载 ZIP、重命名、删除）`"
              :aria-label="`${row.folder.title} 操作菜单`"
              aria-haspopup="menu"
              :aria-expanded="ctxMenuOpenForFolder(row.folder.id, 'kebab')"
              @click.stop="openKebabMenuFolder(row.folder)"
            >⋯</button>
            <ul
              v-if="ctxMenuOpenForFolder(row.folder.id, 'kebab')"
              ref="ctxMenuEl"
              class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
              role="menu"
              @click.self="closeContextMenu"
            >
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewDocInFolder">
                  <span class="doc-panel-ctx-ico" aria-hidden="true">📄</span>新建文档
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportMd">
                  <span class="doc-panel-ctx-ico" aria-hidden="true">⬆</span>上传 Markdown…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderDownloadZip">
                  <span class="doc-panel-ctx-ico" aria-hidden="true">⬇</span>下载为 ZIP
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameFolder">
                  <span class="doc-panel-ctx-ico" aria-hidden="true">✎</span>重命名
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteFolder">
                  <span class="doc-panel-ctx-ico" aria-hidden="true">🗑</span>删除文件夹
                </button>
              </li>
            </ul>
          </li>

          <li
            v-else-if="row.row === 'empty'"
            class="doc-panel-folder-empty"
            role="none"
            :style="{ paddingLeft: `${1.25 + row.depth * 0.75}rem` }"
          >
            空文件夹
          </li>

          <li
            v-else-if="row.row === 'no-folder-divider'"
            class="doc-panel-no-folder-divider"
            :class="{ 'doc-panel-drag-over': dropHighlight === 'root' }"
            role="separator"
            aria-label="根目录文档（不在文件夹内）；可拖入文档移出文件夹"
            @dragover="onRootDropZoneDragOver"
            @dragleave="onRootDropZoneDragLeave"
            @drop="onRootDrop"
          >
            <span class="doc-panel-no-folder-line" aria-hidden="true" />
            <span class="doc-panel-no-folder-label">No Folder</span>
            <span class="doc-panel-no-folder-line" aria-hidden="true" />
          </li>

          <li
            v-else-if="row.row === 'root-drop'"
            class="doc-panel-no-folder-divider doc-panel-root-drop"
            :class="{ 'doc-panel-drag-over': dropHighlight === 'root' }"
            role="separator"
            aria-label="拖到此处移出到根目录"
            @dragover="onRootDropZoneDragOver"
            @dragleave="onRootDropZoneDragLeave"
            @drop="onRootDrop"
          >
            <span class="doc-panel-no-folder-line" aria-hidden="true" />
            <span class="doc-panel-no-folder-label">根目录</span>
            <span class="doc-panel-no-folder-line" aria-hidden="true" />
          </li>

          <li
            v-else
            role="option"
            class="doc-panel-item doc-panel-item--nested"
            :class="{ active: row.doc.id === activeId, 'menu-open': ctxMenuOpenForDoc(row.doc.id, 'kebab') }"
            :style="{ paddingLeft: docRowPaddingLeftRem(row.depth) }"
            :aria-selected="row.doc.id === activeId"
            :draggable="treeMode && renamingId !== row.doc.id"
            @click="onItemClick(row.doc)"
            @dblclick="onItemDblClick(row.doc)"
            @contextmenu="openContextMenu($event, row.doc)"
            @dragstart="onDocDragStart(row.doc, $event)"
            @dragend="onDocDragEnd"
          >
            <input
              v-if="renamingId === row.doc.id"
              :ref="bindRenameInput"
              v-model="renamingDraft"
              class="doc-panel-rename-input"
              type="text"
              @keydown.enter.prevent="commitRename"
              @keydown.escape.prevent="cancelRename"
              @blur="commitRename"
              @click.stop
            />
            <template v-else>
              <div class="doc-panel-item-title" :title="row.doc.title">{{ row.doc.title }}</div>
              <div class="doc-panel-item-meta">{{ formatTimestamp(row.doc.updatedAt) }}</div>
            </template>

            <template v-if="renamingId !== row.doc.id">
              <button
                type="button"
                class="doc-panel-kebab"
                :data-kebab-kind="'doc'"
                :data-kebab-id="row.doc.id"
                :title="`${row.doc.title || '未命名'}：更多操作（重命名、下载、复制、删除等）`"
                :aria-label="`${row.doc.title || '未命名'} 操作菜单`"
                aria-haspopup="menu"
                :aria-expanded="ctxMenuOpenForDoc(row.doc.id, 'kebab')"
                @click.stop="openKebabMenuDoc(row.doc)"
              >⋯</button>

              <ul
                v-if="ctxMenuOpenForDoc(row.doc.id, 'kebab')"
                ref="ctxMenuEl"
                class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
                role="menu"
                @click.self="closeContextMenu"
              >
                <li role="none">
                  <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameDoc">重命名</button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    class="doc-panel-ctx-item"
                    :disabled="!ctxLockedOnly"
                    @click="onCtxUnlock"
                  >恢复跟随 H1</button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDownload">下载</button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDuplicate">复制一份</button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteDoc">删除</button>
                </li>
              </ul>
            </template>
          </li>
        </template>
      </ul>
    </template>

    <ul v-else-if="docs.length" class="doc-panel-list" role="listbox" aria-label="文档列表">
      <li
        v-for="doc in docs"
        :key="doc.id"
        role="option"
        class="doc-panel-item"
        :class="{ active: doc.id === activeId, 'menu-open': ctxMenuOpenForDoc(doc.id, 'kebab') }"
        :aria-selected="doc.id === activeId"
        @click="onItemClick(doc)"
        @dblclick="onItemDblClick(doc)"
        @contextmenu="openContextMenu($event, doc)"
      >
        <input
          v-if="renamingId === doc.id"
          :ref="bindRenameInput"
          v-model="renamingDraft"
          class="doc-panel-rename-input"
          type="text"
          @keydown.enter.prevent="commitRename"
          @keydown.escape.prevent="cancelRename"
          @blur="commitRename"
          @click.stop
        />
        <div v-else class="doc-panel-item-title" :title="doc.title">
          {{ doc.title }}
        </div>
        <div v-if="renamingId !== doc.id" class="doc-panel-item-meta">{{ formatTimestamp(doc.updatedAt) }}</div>

        <template v-if="renamingId !== doc.id">
          <button
            type="button"
            class="doc-panel-kebab"
            :data-kebab-kind="'doc'"
            :data-kebab-id="doc.id"
            :title="`${doc.title || '未命名'}：更多操作（重命名、下载、复制、删除等）`"
            :aria-label="`${doc.title || '未命名'} 操作菜单`"
            aria-haspopup="menu"
            :aria-expanded="ctxMenuOpenForDoc(doc.id, 'kebab')"
            @click.stop="openKebabMenuDoc(doc)"
          >⋯</button>

          <ul
            v-if="ctxMenuOpenForDoc(doc.id, 'kebab')"
            ref="ctxMenuEl"
            class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
            role="menu"
            @click.self="closeContextMenu"
          >
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameDoc">重命名</button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                class="doc-panel-ctx-item"
                :disabled="!ctxLockedOnly"
                @click="onCtxUnlock"
              >恢复跟随 H1</button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDownload">下载</button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDuplicate">复制一份</button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteDoc">删除</button>
            </li>
          </ul>
        </template>
      </li>
    </ul>

    <p
      v-else
      class="doc-panel-empty-list"
    >
      {{ hasLibraryItems ? '未匹配到文档' : '暂无文档，点击右上角 ＋ 新建' }}
    </p>

    <Teleport to="body">
      <ul
        v-if="ctxMenu && ctxMenu.mode === 'cursor'"
        ref="ctxMenuEl"
        class="doc-panel-ctx-menu"
        role="menu"
        :style="{ top: `${ctxMenu.y}px`, left: `${ctxMenu.x}px` }"
        @click.self="closeContextMenu"
      >
        <template v-if="ctxMenu.target.kind === 'doc'">
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameDoc">重命名</button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="doc-panel-ctx-item"
              :disabled="!ctxLockedOnly"
              @click="onCtxUnlock"
            >恢复跟随 H1</button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDownload">下载</button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDuplicate">复制一份</button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteDoc">删除</button>
          </li>
        </template>
        <template v-else>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewDocInFolder">
              <span class="doc-panel-ctx-ico" aria-hidden="true">📄</span>新建文档
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportMd">
              <span class="doc-panel-ctx-ico" aria-hidden="true">⬆</span>上传 Markdown…
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderDownloadZip">
              <span class="doc-panel-ctx-ico" aria-hidden="true">⬇</span>下载为 ZIP
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameFolder">
              <span class="doc-panel-ctx-ico" aria-hidden="true">✎</span>重命名
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteFolder">
              <span class="doc-panel-ctx-ico" aria-hidden="true">🗑</span>删除文件夹
            </button>
          </li>
        </template>
      </ul>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="newFolderDialogOpen"
        class="doc-new-folder-overlay"
        role="presentation"
        @click.self="cancelNewFolderDialog"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-new-folder-title"
          class="doc-new-folder-dialog"
          @click.stop
        >
          <h3 id="doc-new-folder-title" class="doc-new-folder-title">新建文件夹</h3>
          <label class="doc-new-folder-label">
            <span class="doc-new-folder-label-text">文件夹名称</span>
            <input
              ref="newFolderInputRef"
              v-model="newFolderNameDraft"
              type="text"
              class="doc-new-folder-input"
              maxlength="80"
              autocomplete="off"
              aria-required="true"
              @keydown.enter.prevent="confirmNewFolderDialog"
            />
          </label>
          <p v-if="newFolderErr" class="doc-new-folder-err" role="alert">{{ newFolderErr }}</p>
          <div class="doc-new-folder-actions">
            <button type="button" class="ghost-btn" @click="cancelNewFolderDialog">取消</button>
            <button type="button" class="primary-btn" @click="confirmNewFolderDialog">创建</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.doc-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--doc-panel-bg);
  border-right: 1px solid var(--doc-panel-border);
  color: var(--doc-panel-text);
  min-width: 0;
  overflow: hidden;
}

.doc-panel-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0.5rem 0.65rem;
  background: transparent;
}

.doc-panel-toolbar-icons {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.doc-panel-toolbar-icons :deep(.doc-import-wrap) {
  flex-shrink: 0;
}

.doc-panel-toolbar-mode {
  flex-shrink: 0;
}

.doc-toolbar-icon-btn {
  box-sizing: border-box;
  font: inherit;
  margin: 0;
  padding: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--doc-toolbar-icon-border, rgb(213, 212, 226));
  background: var(--doc-toolbar-icon-bg, rgba(0, 0, 0, 0.03));
  color: var(--doc-toolbar-icon-color, rgb(85, 82, 122));
  cursor: pointer;
  line-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-toolbar-icon-btn:hover:not(:disabled) {
  filter: brightness(0.97);
}

.doc-toolbar-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-toolbar-icon-btn--primary {
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: linear-gradient(
    135deg,
    var(--doc-toolbar-icon-primary-start, #3a3a42),
    var(--doc-toolbar-icon-primary-end, #232326)
  );
  color: #f4f4f5;
}

.doc-toolbar-icon-btn--primary:hover:not(:disabled) {
  filter: brightness(1.07);
}

[data-reading='dark'] .doc-toolbar-icon-btn--primary {
  border-color: rgba(255, 255, 255, 0.1);
}

.doc-panel-search {
  position: relative;
  padding: 0.4rem 0.55rem;
}

.doc-panel-search-input {
  width: 100%;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 1.6rem 0.35rem 0.25rem;
  border: none;
  border-bottom: 1px solid var(--doc-panel-border);
  border-radius: 0;
  background: transparent;
  color: var(--doc-panel-text);
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.doc-panel-search-input:focus {
  outline: none;
  border-bottom-color: var(--doc-panel-active-bar);
}

.doc-panel-search-clear {
  position: absolute;
  top: 50%;
  right: 0.85rem;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  color: var(--doc-panel-muted);
}

.doc-panel-list {
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 6rem;
}

.doc-panel-list--tree {
  padding-left: 0;
}

.doc-panel-folder {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.2rem 0.35rem;
  padding: 0.4rem 0.55rem 0.4rem 0.85rem;
  cursor: pointer;
  border-left: 2px solid transparent;
  min-height: 2rem;
}

.doc-panel-folder:hover {
  background: var(--doc-panel-hover);
}

.doc-panel-folder.menu-open {
  background: var(--doc-panel-hover);
}

.doc-panel-folder.doc-panel-drag-over {
  background: rgba(99, 102, 241, 0.12);
  outline: 1px dashed var(--doc-panel-active-bar);
  outline-offset: -1px;
}

[data-reading='dark'] .doc-panel-folder.doc-panel-drag-over {
  background: rgba(129, 140, 248, 0.14);
}

.doc-panel-folder-chevron {
  flex: 0 0 auto;
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  line-height: 1;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  padding: 0;
}

.doc-panel-folder-chevron:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.doc-panel-folder-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--doc-panel-muted);
  opacity: 0.95;
}

.doc-toolbar-icon-inner {
  flex-shrink: 0;
  display: block;
}

.doc-panel-folder-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-panel-folder-rename {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  margin-top: 0;
  grid-column: unset;
  grid-row: unset;
  display: block;
}

.doc-panel-folder-empty {
  list-style: none;
  font-size: 0.78rem;
  color: var(--doc-panel-muted);
  padding: 0.15rem 0.55rem 0.35rem;
  margin: 0;
  border-left: 2px solid transparent;
}

.doc-panel-no-folder-divider {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.55rem 0.35rem;
  margin: 0;
  border-left: 2px solid transparent;
  user-select: none;
}

.doc-panel-no-folder-line {
  flex: 1 1 auto;
  min-width: 0.5rem;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--doc-panel-border) 12%,
    var(--doc-panel-border) 88%,
    transparent
  );
  opacity: 0.95;
}

.doc-panel-no-folder-label {
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--doc-panel-no-folder-label, #2a2a30);
  opacity: 0.9;
  text-transform: none;
}

.doc-panel-no-folder-divider.doc-panel-drag-over {
  background: rgba(99, 102, 241, 0.08);
  border-radius: 4px;
}

.doc-panel-no-folder-divider.doc-panel-drag-over .doc-panel-no-folder-label {
  opacity: 1;
}

.doc-panel-item[draggable='true'] {
  cursor: grab;
}

.doc-panel-item[draggable='true']:active {
  cursor: grabbing;
}

.doc-panel-item {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 0.4rem;
  padding: 0.5rem 0.55rem 0.5rem 0.85rem;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.doc-panel-item--nested {
  grid-template-columns: 1fr auto;
}

.doc-panel-item:hover {
  background: var(--doc-panel-hover);
}

.doc-panel-item.active {
  background: var(--doc-panel-active-bg);
  border-left-color: var(--doc-panel-active-bar);
}

.doc-panel-item-title {
  grid-column: 1;
  grid-row: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--doc-panel-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.doc-panel-item-meta {
  grid-column: 1;
  grid-row: 2;
  margin-top: 0.1rem;
  font-size: 0.7rem;
  color: var(--doc-panel-muted);
  line-height: 1.2;
}

.doc-panel-kebab {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  justify-self: end;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  opacity: 0.35;
}

.doc-panel-kebab--folder {
  grid-column: unset;
  grid-row: unset;
  margin-left: auto;
  opacity: 0.35;
}

.doc-panel-folder:hover .doc-panel-kebab--folder,
.doc-panel-folder.menu-open .doc-panel-kebab--folder {
  opacity: 1;
}

.doc-panel-item:hover .doc-panel-kebab,
.doc-panel-item.menu-open .doc-panel-kebab {
  opacity: 1;
}

.doc-panel-kebab:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.doc-panel-rename-input {
  grid-column: 1 / span 2;
  grid-row: 1 / span 2;
  width: 100%;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  border: 1px solid var(--doc-panel-active-bar);
  background: var(--doc-panel-surface);
  color: var(--doc-panel-text);
  box-sizing: border-box;
}

.doc-panel-empty-list {
  margin: 0.85rem 0.65rem;
  font-size: 0.8125rem;
  color: var(--doc-panel-muted);
  text-align: center;
}

.doc-panel-ctx-menu {
  position: fixed;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 10.5rem;
  background: var(--doc-panel-surface);
  border: 1px solid var(--doc-panel-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 60;
}

.doc-panel-ctx-menu--kebab {
  position: absolute;
  top: calc(100% - 4px);
  right: 6px;
  left: auto;
}

.doc-panel-folder .doc-panel-ctx-menu--kebab {
  top: calc(100% - 2px);
  right: 4px;
}

.doc-panel-ctx-item {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.4rem 0.85rem;
  border: none;
  background: transparent;
  color: var(--doc-panel-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.doc-panel-ctx-ico {
  flex: 0 0 auto;
  font-size: 0.85rem;
  opacity: 0.85;
}

.doc-panel-ctx-item:hover:not(:disabled) {
  background: var(--doc-panel-hover);
}

.doc-panel-ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-panel-ctx-item.danger {
  color: #dc2626;
}

[data-reading='dark'] .doc-panel-ctx-item.danger {
  color: #f87171;
}

.doc-new-folder-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 110;
}

.doc-new-folder-dialog {
  width: min(400px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: var(--doc-panel-surface, #fff);
  border: 1px solid var(--doc-panel-border, #e5e7eb);
  color: var(--doc-panel-text, #1f2937);
}

.doc-new-folder-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.doc-new-folder-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
}

.doc-new-folder-label-text {
  color: var(--doc-panel-muted, #6b7280);
}

.doc-new-folder-input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--doc-panel-border, #e5e7eb);
  width: 100%;
  box-sizing: border-box;
  background: var(--doc-panel-bg, #fafbfc);
  color: var(--doc-panel-text, #1f2937);
}

.doc-new-folder-err {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  color: #b45309;
}

.doc-new-folder-actions {
  margin-top: 0.85rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
