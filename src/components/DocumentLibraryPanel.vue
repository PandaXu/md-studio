<!-- src/components/DocumentLibraryPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Doc, FolderRecord } from '@/markdown/documentStore'
import DocumentImportMenu, { type DocLibraryImportPayload } from '@/components/DocumentImportMenu.vue'
import AppModeNav from '@/components/AppModeNav.vue'
import FileModeSwitch from '@/components/FileModeSwitch.vue'
import FolderOutlineIcon from '@/components/icons/FolderOutlineIcon.vue'
import type { LibraryReorderPayload } from '@/composables/useDocumentLibrary'
import { compareLibrarySiblings, effectiveDocParentId, validFolderIdSet } from '@/markdown/librarySort'

type CtxTarget = { kind: 'doc'; id: string } | { kind: 'folder'; id: string }

type CtxMenuState = { target: CtxTarget; mode: 'cursor'; x: number; y: number } | { target: CtxTarget; mode: 'kebab' }

type TreeRow =
  | { row: 'folder'; folder: FolderRecord; depth: number }
  | { row: 'doc'; doc: Doc; depth: number }
  | { row: 'empty'; folderId: string; depth: number }

const props = defineProps<{
  folders: readonly FolderRecord[]
  docs: readonly Doc[]
  activeId: string | null
  searchQuery: string
  hasLibraryItems: boolean
  treeMode: boolean
  downloadActiveDisabled: boolean
  fileMode: 'local' | 'web'
  workspacePath: string | null
  isElectron: boolean
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
  moveFolderInto: [folderId: string, targetFolderId: string]
  reorderLibrary: [payload: LibraryReorderPayload]
  imported: [payload: DocLibraryImportPayload]
  importError: [message: string]
  newFolder: [parentId: string | null, title: string]
  'update:fileMode': [value: 'local' | 'web']
  selectLocalFolder: []
}>()

const isLocalMode = computed(() => props.fileMode === 'local')

const importMenuRef = ref<InstanceType<typeof DocumentImportMenu> | null>(null)

const newFolderDialogOpen = ref(false)
const newFolderParentId = ref<string | null>(null)
const newFolderNameDraft = ref('')
const newFolderErr = ref<string | null>(null)
const newFolderInputRef = ref<HTMLInputElement | null>(null)

function openNewFolderDialog() {
  newFolderParentId.value = null
  newFolderNameDraft.value = ''
  newFolderErr.value = null
  newFolderDialogOpen.value = true
  void nextTick(() => {
    newFolderInputRef.value?.focus()
  })
}

function openNewSubfolderDialog(parentId: string) {
  newFolderParentId.value = parentId
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
  newFolderParentId.value = null
}

function confirmNewFolderDialog() {
  const t = newFolderNameDraft.value.replace(/\s+/g, ' ').trim()
  if (!t) {
    newFolderErr.value = '请输入文件夹名称'
    return
  }
  const parent = newFolderParentId.value
  newFolderDialogOpen.value = false
  newFolderErr.value = null
  newFolderParentId.value = null
  emit('newFolder', parent, t)
}

const newFolderDialogTitle = computed(() => {
  if (!newFolderParentId.value) return '新建文件夹'
  const f = props.folders.find((x) => x.id === newFolderParentId.value)
  const name = f?.title?.trim() || '文件夹'
  return `在「${name}」下新建子文件夹`
})

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

const DRAG_LIBRARY_MIME = 'application/x-md-studio-library'

type LibraryDragSubject = { kind: 'doc' | 'folder'; id: string }

/** 正在拖拽的条目（dragover 阶段部分浏览器无法读 dataTransfer） */
const dragLibrarySubject = ref<LibraryDragSubject | null>(null)
/** 当前高亮的「移入文件夹」目标 */
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
  const validFolderIds = validFolderIdSet(fList)

  function effParent(doc: Doc): string | null {
    return effectiveDocParentId(doc, validFolderIds)
  }

  function childEntries(pid: string | null): ({ kind: 'folder'; folder: FolderRecord } | { kind: 'doc'; doc: Doc })[] {
    const fs = fList.filter((f) => f.parentId === pid)
    const ds = dList.filter((d) => effParent(d) === pid)
    const merged: ({ kind: 'folder'; folder: FolderRecord } | { kind: 'doc'; doc: Doc })[] = [
      ...fs.map((folder) => ({ kind: 'folder' as const, folder })),
      ...ds.map((doc) => ({ kind: 'doc' as const, doc })),
    ]
    merged.sort((a, b) => {
      const itemA = a.kind === 'folder' ? a.folder : a.doc
      const itemB = b.kind === 'folder' ? b.folder : b.doc
      return compareLibrarySiblings(itemA, itemB)
    })
    return merged
  }

  function walkFolder(folder: FolderRecord, depth: number) {
    rows.push({ row: 'folder', folder, depth })
    if (!isFolderExpanded(folder.id)) return
    const entries = childEntries(folder.id)
    if (entries.length === 0) {
      rows.push({ row: 'empty', folderId: folder.id, depth: depth + 1 })
      return
    }
    for (const e of entries) {
      if (e.kind === 'folder') walkFolder(e.folder, depth + 1)
      else rows.push({ row: 'doc', doc: e.doc, depth: depth + 1 })
    }
  }

  for (const e of childEntries(null)) {
    if (e.kind === 'folder') walkFolder(e.folder, 0)
    else rows.push({ row: 'doc', doc: e.doc, depth: 0 })
  }
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

function onCtxFolderImportFolder() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  importMenuRef.value?.openFolderPickerForFolder(id)
}

function onCtxNewSubfolder() {
  if (!ctxMenu.value || ctxMenu.value.target.kind !== 'folder') return
  const id = ctxMenu.value.target.id
  closeContextMenu()
  setFolderExpandedState({ ...expanded.value, [id]: true })
  openNewSubfolderDialog(id)
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

function readLibrarySubject(dt: DataTransfer | null): LibraryDragSubject | null {
  if (!dt) return null
  const raw = dt.getData(DRAG_LIBRARY_MIME).trim()
  if (raw) {
    try {
      const p = JSON.parse(raw) as { kind?: unknown; id?: unknown }
      if (p.kind === 'doc' && typeof p.id === 'string') return { kind: 'doc', id: p.id }
      if (p.kind === 'folder' && typeof p.id === 'string') return { kind: 'folder', id: p.id }
    } catch {
      /* ignore */
    }
  }
  const plain = dt.getData('text/plain').trim()
  if (plain.startsWith('doc:')) return { kind: 'doc', id: plain.slice(4) }
  if (plain.startsWith('folder:')) return { kind: 'folder', id: plain.slice(7) }
  return null
}

function rowInsertBefore(ev: DragEvent, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return ev.clientY < r.top + r.height / 2
}

function panelEffectiveDocParent(doc: Doc): string | null {
  return effectiveDocParentId(doc, validFolderIdSet([...props.folders]))
}

function onLibraryDragEnd() {
  dragLibrarySubject.value = null
  dropHighlight.value = null
}

function onDocDragStart(doc: Doc, ev: DragEvent) {
  if (!props.treeMode || renamingId.value === doc.id) {
    ev.preventDefault()
    return
  }
  const t = ev.target as HTMLElement | null
  if (t?.closest('.doc-panel-kebab') || t?.closest('.doc-panel-rename-input')) {
    ev.preventDefault()
    return
  }
  dragLibrarySubject.value = { kind: 'doc', id: doc.id }
  ev.dataTransfer?.setData(DRAG_LIBRARY_MIME, JSON.stringify({ kind: 'doc', id: doc.id }))
  ev.dataTransfer?.setData('text/plain', `doc:${doc.id}`)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}

function onFolderDragStart(folder: FolderRecord, ev: DragEvent) {
  if (!props.treeMode || renamingFolderId.value === folder.id) {
    ev.preventDefault()
    return
  }
  const t = ev.target as HTMLElement | null
  if (
    t?.closest('.doc-panel-folder-chevron') ||
    t?.closest('.doc-panel-kebab') ||
    t?.closest('.doc-panel-folder-move-into') ||
    t?.closest('input')
  ) {
    ev.preventDefault()
    return
  }
  dragLibrarySubject.value = { kind: 'folder', id: folder.id }
  ev.dataTransfer?.setData(DRAG_LIBRARY_MIME, JSON.stringify({ kind: 'folder', id: folder.id }))
  ev.dataTransfer?.setData('text/plain', `folder:${folder.id}`)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}

function onDocRowDragOver(_doc: Doc, ev: DragEvent) {
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  if (!props.treeMode || !subj) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
}

function onDocRowDrop(doc: Doc, ev: DragEvent) {
  ev.preventDefault()
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  onLibraryDragEnd()
  if (!subj) return
  if (subj.kind === 'doc' && subj.id === doc.id) return
  const el = ev.currentTarget as HTMLElement
  const insertBefore = rowInsertBefore(ev, el)
  const parent = panelEffectiveDocParent(doc)
  emit('reorderLibrary', {
    draggedKind: subj.kind,
    draggedId: subj.id,
    targetParentId: parent,
    anchorKind: 'doc',
    anchorId: doc.id,
    insertBefore,
  })
}

function onFolderRowDragOver(_folder: FolderRecord, ev: DragEvent) {
  const t = ev.target as HTMLElement | null
  if (t?.closest('.doc-panel-folder-move-into')) return
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  if (!props.treeMode || !subj) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
}

function onFolderRowDrop(folder: FolderRecord, ev: DragEvent) {
  const t = ev.target as HTMLElement | null
  if (t?.closest('.doc-panel-folder-move-into')) return
  ev.preventDefault()
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  onLibraryDragEnd()
  if (!subj) return
  if (subj.kind === 'folder' && subj.id === folder.id) return
  const el = ev.currentTarget as HTMLElement
  const insertBefore = rowInsertBefore(ev, el)
  emit('reorderLibrary', {
    draggedKind: subj.kind,
    draggedId: subj.id,
    targetParentId: folder.parentId,
    anchorKind: 'folder',
    anchorId: folder.id,
    insertBefore,
  })
}

function onFolderMoveIntoDragOver(folderId: string, ev: DragEvent) {
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  if (!props.treeMode || !subj) return
  if (subj.kind === 'folder' && subj.id === folderId) return
  ev.preventDefault()
  ev.stopPropagation()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dropHighlight.value = folderId
}

function onFolderMoveIntoDragLeave(ev: DragEvent) {
  const cur = ev.currentTarget as HTMLElement
  const rel = ev.relatedTarget as Node | null
  if (rel && cur.contains(rel)) return
  dropHighlight.value = null
}

function onFolderMoveIntoDrop(folderId: string, ev: DragEvent) {
  ev.preventDefault()
  ev.stopPropagation()
  const subj = dragLibrarySubject.value ?? readLibrarySubject(ev.dataTransfer)
  onLibraryDragEnd()
  if (!subj) return
  if (subj.kind === 'doc') {
    emit('moveDoc', subj.id, folderId)
    return
  }
  if (subj.kind === 'folder') {
    if (subj.id === folderId) return
    emit('moveFolderInto', subj.id, folderId)
  }
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
          v-if="!isLocalMode"
          ref="importMenuRef"
          menu-id="doc-library-import"
          @imported="(p) => emit('imported', p)"
          @error="(msg) => emit('importError', msg)"
        />
        <button
          v-if="!isLocalMode"
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
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <template v-if="treeMode">
      <ul v-if="treeRows.length" class="doc-panel-list doc-panel-list--tree" role="list">
        <template
          v-for="(row, idx) in treeRows"
          :key="row.row === 'doc' ? row.doc.id : row.row === 'folder' ? row.folder.id : `e-${row.folderId}-${idx}`"
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
            :draggable="treeMode && renamingFolderId !== row.folder.id"
            @click="onFolderRowClick($event, row.folder)"
            @contextmenu="openFolderContextMenu($event, row.folder)"
            @dragstart="onFolderDragStart(row.folder, $event)"
            @dragend="onLibraryDragEnd"
            @dragover="onFolderRowDragOver(row.folder, $event)"
            @drop="onFolderRowDrop(row.folder, $event)"
          >
            <span
              class="doc-panel-folder-move-into doc-panel-folder-move-into--lead"
              title="拖拽至此移入文件夹"
              @dragover="onFolderMoveIntoDragOver(row.folder.id, $event)"
              @dragleave="onFolderMoveIntoDragLeave($event)"
              @drop="onFolderMoveIntoDrop(row.folder.id, $event)"
            >
            <button
              type="button"
              class="doc-panel-folder-chevron"
              :aria-expanded="isFolderExpanded(row.folder.id)"
              :title="isFolderExpanded(row.folder.id) ? '折叠子列表' : '展开查看文件夹内文档'"
              :aria-label="isFolderExpanded(row.folder.id) ? '折叠文件夹' : '展开文件夹'"
              @click.stop="toggleFolderExpand(row.folder.id)"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true"
                :style="{ transform: isFolderExpanded(row.folder.id) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }"
              ><path d="m9 18 6-6-6-6"/></svg>
            </button>
            <span class="doc-panel-folder-icon" aria-hidden="true">
              <FolderOutlineIcon :size="14" />
            </span>
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
            <span
              class="doc-panel-folder-move-into doc-panel-folder-move-into--tail"
              title="拖拽至此移入文件夹"
              aria-label="拖拽至此移入文件夹"
              @click.stop
              @dragover="onFolderMoveIntoDragOver(row.folder.id, $event)"
              @dragleave="onFolderMoveIntoDragLeave($event)"
              @drop="onFolderMoveIntoDrop(row.folder.id, $event)"
            >
              <span class="doc-panel-folder-move-into-icon" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
              </span>
            </span>
            <button
              v-if="renamingFolderId !== row.folder.id"
              type="button"
              class="doc-panel-kebab doc-panel-kebab--folder"
              :data-kebab-kind="'folder'"
              :data-kebab-id="row.folder.id"
              :title="`${row.folder.title}：更多操作（新建、子文件夹、上传、下载 ZIP、重命名、删除）`"
              :aria-label="`${row.folder.title} 操作菜单`"
              aria-haspopup="menu"
              :aria-expanded="ctxMenuOpenForFolder(row.folder.id, 'kebab')"
              @click.stop="openKebabMenuFolder(row.folder)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            <ul
              v-if="ctxMenuOpenForFolder(row.folder.id, 'kebab')"
              ref="ctxMenuEl"
              class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
              role="menu"
              @click.self="closeContextMenu"
            >
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewDocInFolder">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  新建文档
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewSubfolder">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                  新建子文件夹
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportMd">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  上传 Markdown…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportFolder">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 15 14"/></svg>
                  上传文件夹…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderDownloadZip">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载为 ZIP
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameFolder">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  重命名
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteFolder">
                  <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  删除文件夹
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
            @dragend="onLibraryDragEnd"
            @dragover="onDocRowDragOver(row.doc, $event)"
            @drop="onDocRowDrop(row.doc, $event)"
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
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                </svg>
              </button>

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
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
            </svg>
          </button>

          <ul
            v-if="ctxMenuOpenForDoc(doc.id, 'kebab')"
            ref="ctxMenuEl"
            class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
            role="menu"
            @click.self="closeContextMenu"
          >
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameDoc">
                <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                重命名
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                class="doc-panel-ctx-item"
                :disabled="!ctxLockedOnly"
                @click="onCtxUnlock"
              >
                <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                恢复跟随 H1
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDownload">
                <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                下载
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDuplicate">
                <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                复制一份
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteDoc">
                <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                删除
              </button>
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
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameDoc">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              重命名
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              class="doc-panel-ctx-item"
              :disabled="!ctxLockedOnly"
              @click="onCtxUnlock"
            >
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              恢复跟随 H1
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDownload">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxDuplicate">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制一份
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteDoc">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除
            </button>
          </li>
        </template>
        <template v-else>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewDocInFolder">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              新建文档
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxNewSubfolder">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              新建子文件夹
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportMd">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              上传 Markdown…
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderImportFolder">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 15 14"/></svg>
              上传文件夹…
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxFolderDownloadZip">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载为 ZIP
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRenameFolder">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              重命名
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDeleteFolder">
              <svg class="doc-panel-ctx-ico-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除文件夹
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
          <h3 id="doc-new-folder-title" class="doc-new-folder-title">{{ newFolderDialogTitle }}</h3>
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

    <FileModeSwitch
      :model-value="fileMode"
      :workspace-path="workspacePath"
      :is-electron="isElectron"
      @update:model-value="(v: 'local' | 'web') => emit('update:fileMode', v)"
      @select-folder="emit('selectLocalFolder')"
    />
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
  padding: 0.4rem 0.5rem;
  background: transparent;
}

.doc-panel-toolbar-icons {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
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
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--doc-toolbar-icon-color);
  cursor: pointer;
  line-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-toolbar-icon-btn:hover:not(:disabled) {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.doc-toolbar-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-toolbar-icon-btn--primary {
  background: rgba(0, 0, 0, 0.06);
  color: var(--doc-panel-text);
}

.doc-toolbar-icon-btn--primary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
}

[data-reading='dark'] .doc-toolbar-icon-btn--primary {
  background: rgba(255, 255, 255, 0.1);
}

[data-reading='dark'] .doc-toolbar-icon-btn--primary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.doc-panel-search {
  position: relative;
  padding: 0.3rem 0.45rem;
}

.doc-panel-search-input {
  width: 100%;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.3rem 1.4rem 0.3rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
  box-sizing: border-box;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.doc-panel-search-input::placeholder {
  color: var(--doc-panel-muted);
}

.doc-panel-search-input:focus {
  outline: none;
  background: var(--doc-panel-surface);
  border-color: var(--accent);
}

.doc-panel-search-clear {
  position: absolute;
  top: 50%;
  right: 0.6rem;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--doc-panel-muted);
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.doc-panel-search-clear:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.doc-panel-list {
  margin: 0;
  padding: 0.2rem 0;
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
  gap: 0.15rem 0.25rem;
  padding: 0.25rem 0.4rem 0.25rem 0.65rem;
  cursor: pointer;
  min-height: 1.85rem;
  font-size: 0.85rem;
  color: var(--doc-panel-text);
}

.doc-panel-folder:hover {
  background: var(--doc-panel-hover);
}

.doc-panel-folder.menu-open {
  background: var(--doc-panel-hover);
}

.doc-panel-folder.doc-panel-drag-over {
  background: var(--doc-panel-hover);
  outline: 1px solid var(--doc-panel-active-bar);
  outline-offset: -1px;
}

.doc-panel-folder-chevron {
  flex: 0 0 auto;
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  padding: 0;
}

.doc-panel-folder-chevron:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.doc-panel-folder-chevron svg {
  display: block;
}

.doc-panel-folder-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--doc-panel-muted);
  opacity: 0.7;
}

.doc-toolbar-icon-inner {
  flex-shrink: 0;
  display: block;
}

.doc-panel-folder-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-panel-folder-move-into {
  flex: 0 0 auto;
  border-radius: 3px;
}

.doc-panel-folder-move-into--lead {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.15rem;
}

.doc-panel-folder-move-into--tail {
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--doc-panel-muted);
  opacity: 0.5;
  cursor: default;
  user-select: none;
  border-radius: 3px;
}

.doc-panel-folder-move-into--tail:hover {
  background: var(--doc-panel-hover);
  opacity: 1;
}

.doc-panel-folder-move-into-icon {
  line-height: 1;
}

.doc-panel-folder-rename {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.doc-panel-folder-empty {
  list-style: none;
  font-size: 0.78rem;
  color: var(--doc-panel-muted);
  padding: 0.1rem 0.55rem 0.3rem;
  margin: 0;
}

.doc-panel-no-folder-divider {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.4rem 0.2rem;
  margin: 0;
  user-select: none;
}

.doc-panel-no-folder-line {
  flex: 1 1 auto;
  min-width: 0.5rem;
  height: 1px;
  background: var(--doc-panel-border);
  opacity: 0.8;
}

.doc-panel-no-folder-label {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--doc-panel-no-folder-label);
}

.doc-panel-no-folder-divider.doc-panel-drag-over {
  background: var(--doc-panel-hover);
  border-radius: 3px;
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
  column-gap: 0.3rem;
  padding: 0.3rem 0.4rem 0.3rem 0.65rem;
  cursor: pointer;
}

.doc-panel-item--nested {
  grid-template-columns: 1fr auto;
}

.doc-panel-item:hover {
  background: var(--doc-panel-hover);
}

.doc-panel-item.active {
  background: var(--doc-panel-active-bg);
}

.doc-panel-item-title {
  grid-column: 1;
  grid-row: 1;
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--doc-panel-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
}

.doc-panel-item-meta {
  grid-column: 1;
  grid-row: 2;
  margin-top: 0.05rem;
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
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  line-height: 0;
}

.doc-panel-kebab svg {
  display: block;
}

.doc-panel-kebab--folder {
  grid-column: unset;
  grid-row: unset;
  margin-left: auto;
  opacity: 0;
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
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  border: 1px solid var(--accent);
  background: var(--doc-panel-surface);
  color: var(--doc-panel-text);
  box-sizing: border-box;
}

.doc-panel-empty-list {
  margin: 0.75rem 0.55rem;
  font-size: 0.8125rem;
  color: var(--doc-panel-muted);
  text-align: center;
}

.doc-panel-ctx-menu {
  position: fixed;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 10rem;
  background: var(--doc-panel-surface);
  border: 1px solid var(--doc-panel-border);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
  z-index: 60;
}

.doc-panel-ctx-menu--kebab {
  position: absolute;
  top: calc(100% - 2px);
  right: 4px;
  left: auto;
}

.doc-panel-folder .doc-panel-ctx-menu--kebab {
  top: calc(100% - 2px);
  right: 2px;
}

.doc-panel-ctx-item {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.75rem;
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
}

.doc-panel-ctx-ico-svg {
  flex: 0 0 auto;
  opacity: 0.6;
  flex-shrink: 0;
}

.doc-panel-ctx-item:hover:not(:disabled) {
  background: var(--doc-panel-hover);
}

.doc-panel-ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-panel-ctx-item.danger {
  color: #e5484d;
}

[data-reading='dark'] .doc-panel-ctx-item.danger {
  color: #f87171;
}

.doc-new-folder-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: grid;
  place-items: center;
  z-index: 110;
}

.doc-new-folder-dialog {
  width: min(380px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 6px;
  background: var(--doc-panel-surface);
  border: 1px solid var(--doc-panel-border);
  color: var(--doc-panel-text);
  box-shadow: var(--shadow-lg);
}

.doc-new-folder-title {
  margin: 0 0 0.6rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.doc-new-folder-label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.8125rem;
}

.doc-new-folder-label-text {
  color: var(--doc-panel-muted);
}

.doc-new-folder-input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--doc-panel-border);
  width: 100%;
  box-sizing: border-box;
  background: var(--doc-panel-surface);
  color: var(--doc-panel-text);
}

.doc-new-folder-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.doc-new-folder-err {
  margin: 0.4rem 0 0;
  font-size: 0.8125rem;
  color: var(--error-text);
}

.doc-new-folder-actions {
  margin-top: 0.75rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>
