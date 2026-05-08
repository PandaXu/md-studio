import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { strToU8, zipSync } from 'fflate'
import { openDocStore, isFolderRecord, type Doc, type DocStore, type FolderRecord } from '@/markdown/documentStore'
import { runMigrationIfNeeded } from '@/markdown/documentMigration'
import {
  deriveTitle,
  nextUntitledOrdinal,
  safeFilenameFromTitle,
  sanitizeRenameInput,
} from '@/markdown/documentTitle'
import defaultSample from '@/samples/harness-era-article.md?raw'

const ACTIVE_ID_KEY = 'markdown-editor-active-doc-id'
const AUTOSAVE_DEBOUNCE_MS = 320

export type LibraryStatus = 'loading' | 'ready' | 'unavailable'

export type LibraryHandle = {
  status: Ref<LibraryStatus>
  unavailableMessage: Ref<string | null>
  docs: Ref<Doc[]>
  folders: Ref<FolderRecord[]>
  activeId: Ref<string | null>
  activeDoc: ComputedRef<Doc | null>
  activeContent: Ref<string>
  searchQuery: Ref<string>
  filteredDocs: ComputedRef<Doc[]>
  hasDocs: ComputedRef<boolean>
  hasLibraryItems: ComputedRef<boolean>
  treeMode: ComputedRef<boolean>
  setActive(id: string): Promise<void>
  createEmptyDoc(folderId?: string | null): Promise<Doc>
  createDocFromContent(
    content: string,
    opts?: { title?: string; titleLocked?: boolean; folderId?: string | null },
  ): Promise<Doc>
  loadSampleAsNewDoc(): Promise<Doc>
  renameDoc(id: string, newTitle: string): Promise<void>
  unlockTitle(id: string): Promise<void>
  deleteDoc(id: string): Promise<void>
  duplicateDoc(id: string): Promise<Doc | null>
  createFolder(parentId: string | null, preferredTitle?: string | null): Promise<FolderRecord>
  renameFolder(id: string, newTitle: string): Promise<void>
  deleteFolder(id: string): Promise<void>
  exportFolderAsZip(folderId: string): Promise<void>
  moveDocToFolder(docId: string, folderId: string | null): Promise<void>
  flush(): Promise<void>
  exportDocAsMarkdown(id: string): { filename: string; blob: Blob } | null
  exportActiveAsMarkdown(): { filename: string; blob: Blob } | null
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY)
  } catch {
    return null
  }
}

function writeStoredActiveId(id: string | null) {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_ID_KEY)
    else localStorage.setItem(ACTIVE_ID_KEY, id)
  } catch {
    /* ignore */
  }
}

function nextFolderTitle(parentId: string | null, folders: readonly FolderRecord[]): string {
  const siblings = folders.filter((f) => f.parentId === parentId)
  const used = new Set(siblings.map((f) => f.title))
  let n = 1
  let candidate = '文件夹'
  while (used.has(candidate)) {
    n += 1
    candidate = `文件夹 ${n}`
  }
  return candidate
}

function fsSafeSegment(title: string): string {
  const stripped = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
  return stripped || 'folder'
}

function collectDescendantFolderIds(rootId: string, folders: readonly FolderRecord[]): Set<string> {
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const fid = stack.pop()!
    out.add(fid)
    for (const f of folders) {
      if (f.parentId === fid) stack.push(f.id)
    }
  }
  return out
}

export function useDocumentLibrary(): LibraryHandle {
  const status = ref<LibraryStatus>('loading')
  const unavailableMessage = ref<string | null>(null)
  const docs = ref<Doc[]>([])
  const folders = ref<FolderRecord[]>([])
  const activeId = ref<string | null>(null)
  const activeContent = ref<string>('')
  const searchQuery = ref<string>('')

  let store: DocStore | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPutId: string | null = null
  let suppressNextWatch = false

  const activeDoc = computed<Doc | null>(() => {
    if (!activeId.value) return null
    return docs.value.find((d) => d.id === activeId.value) ?? null
  })

  const sortedDocs = computed<Doc[]>(() =>
    [...docs.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  const treeMode = computed(() => searchQuery.value.trim().length === 0)

  const filteredDocs = computed<Doc[]>(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return sortedDocs.value
    const matched = sortedDocs.value.filter((d) => d.title.toLowerCase().includes(q))
    if (activeId.value) {
      const active = sortedDocs.value.find((d) => d.id === activeId.value)
      if (active && !matched.some((d) => d.id === active.id)) {
        return [active, ...matched]
      }
    }
    return matched
  })

  const hasDocs = computed(() => docs.value.length > 0)
  const hasLibraryItems = computed(() => docs.value.length > 0 || folders.value.length > 0)

  function loadDocIntoEditor(doc: Doc | null) {
    suppressNextWatch = true
    activeContent.value = doc?.content ?? ''
  }

  async function persistDocImmediately(doc: Doc) {
    if (!store) return
    await store.put(doc)
  }

  function scheduleAutosave() {
    if (saveTimer) clearTimeout(saveTimer)
    const idAtSchedule = activeId.value
    pendingPutId = idAtSchedule
    saveTimer = setTimeout(() => {
      saveTimer = null
      void doFlush(idAtSchedule)
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  async function doFlush(targetId: string | null) {
    try {
      if (!targetId) return
      const idx = docs.value.findIndex((d) => d.id === targetId)
      if (idx === -1) return
      const current = docs.value[idx]
      const nextContent = targetId === activeId.value ? activeContent.value : current.content
      if (current.content === nextContent) return
      const ts = Date.now()
      const nextTitle = current.titleLocked
        ? current.title
        : deriveTitle(nextContent, nextUntitledOrdinal(docs.value.map((d) => d.title)))
      const updated: Doc = {
        ...current,
        content: nextContent,
        title: nextTitle,
        updatedAt: ts,
      }
      docs.value.splice(idx, 1, updated)
      await persistDocImmediately(updated)
    } finally {
      if (pendingPutId === targetId) pendingPutId = null
    }
  }

  async function flush(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const target = pendingPutId ?? activeId.value
    await doFlush(target)
  }

  async function setActive(id: string): Promise<void> {
    if (id === activeId.value) return
    await flush()
    const next = docs.value.find((d) => d.id === id)
    activeId.value = id
    writeStoredActiveId(id)
    loadDocIntoEditor(next ?? null)
  }

  async function createDocFromContent(
    content: string,
    opts?: { title?: string; titleLocked?: boolean; folderId?: string | null },
  ): Promise<Doc> {
    const ts = Date.now()
    const ordinal = nextUntitledOrdinal(docs.value.map((d) => d.title))
    const title =
      opts?.title && opts.title.trim().length > 0
        ? opts.title.trim()
        : deriveTitle(content, ordinal)
    const folderId = opts?.folderId === undefined ? null : opts.folderId
    const doc: Doc = {
      id: newId(),
      folderId,
      title,
      titleLocked: opts?.titleLocked ?? false,
      content,
      createdAt: ts,
      updatedAt: ts,
    }
    docs.value = [doc, ...docs.value]
    if (store) await store.put(doc)
    return doc
  }

  async function createEmptyDoc(folderId?: string | null): Promise<Doc> {
    const fid = folderId === undefined ? null : folderId
    const doc = await createDocFromContent('', { titleLocked: false, folderId: fid })
    await setActive(doc.id)
    return doc
  }

  async function loadSampleAsNewDoc(): Promise<Doc> {
    const doc = await createDocFromContent(defaultSample, {
      title: '示例文章',
      titleLocked: false,
    })
    await setActive(doc.id)
    return doc
  }

  async function renameDoc(id: string, newTitle: string): Promise<void> {
    const idx = docs.value.findIndex((d) => d.id === id)
    if (idx === -1) return
    const current = docs.value[idx]
    const cleaned = sanitizeRenameInput(newTitle, current.title)
    if (cleaned == null) return
    const updated: Doc = {
      ...current,
      title: cleaned,
      titleLocked: true,
    }
    docs.value.splice(idx, 1, updated)
    if (store) await store.put(updated)
  }

  async function unlockTitle(id: string): Promise<void> {
    const idx = docs.value.findIndex((d) => d.id === id)
    if (idx === -1) return
    const current = docs.value[idx]
    if (!current.titleLocked) return
    const ordinal = nextUntitledOrdinal(docs.value.map((d) => d.title))
    const nextTitle = deriveTitle(current.content, ordinal)
    const updated: Doc = { ...current, titleLocked: false, title: nextTitle }
    docs.value.splice(idx, 1, updated)
    if (store) await store.put(updated)
  }

  async function deleteDoc(id: string): Promise<void> {
    const idx = docs.value.findIndex((d) => d.id === id)
    if (idx === -1) return
    if (pendingPutId === id) {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      pendingPutId = null
    }
    if (store) await store.delete(id)
    const wasActive = activeId.value === id
    const sortedBefore = sortedDocs.value
    const sortedIdx = sortedBefore.findIndex((d) => d.id === id)
    docs.value.splice(idx, 1)
    if (!wasActive) return
    const fallback =
      sortedBefore[sortedIdx - 1] ??
      sortedBefore[sortedIdx + 1] ??
      sortedDocs.value[0] ??
      null
    if (fallback && fallback.id !== id) {
      activeId.value = fallback.id
      writeStoredActiveId(fallback.id)
      loadDocIntoEditor(fallback)
    } else {
      activeId.value = null
      writeStoredActiveId(null)
      loadDocIntoEditor(null)
    }
  }

  async function duplicateDoc(id: string): Promise<Doc | null> {
    if (id === activeId.value) await flush()
    const original = docs.value.find((d) => d.id === id)
    if (!original) return null
    const ts = Date.now()
    const dup: Doc = {
      id: newId(),
      folderId: original.folderId ?? null,
      title: `${original.title} 副本`,
      titleLocked: original.titleLocked,
      content: original.content,
      createdAt: ts,
      updatedAt: ts,
    }
    docs.value = [dup, ...docs.value]
    if (store) await store.put(dup)
    return dup
  }

  async function moveDocToFolder(docId: string, folderId: string | null): Promise<void> {
    await flush()
    const idx = docs.value.findIndex((d) => d.id === docId)
    if (idx === -1) return
    const current = docs.value[idx]
    const nextFolder = folderId
    if (nextFolder != null && !folders.value.some((f) => f.id === nextFolder)) return
    const prev = current.folderId ?? null
    if (prev === (nextFolder ?? null)) return
    const ts = Date.now()
    const updated: Doc = {
      ...current,
      folderId: nextFolder,
      updatedAt: ts,
    }
    docs.value.splice(idx, 1, updated)
    if (store) await store.put(updated)
  }

  const FOLDER_TITLE_MAX = 80
  function clipFolderTitle(raw: string): string {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (t.length <= FOLDER_TITLE_MAX) return t
    return `${t.slice(0, FOLDER_TITLE_MAX - 1)}…`
  }

  async function createFolder(parentId: string | null, preferredTitle?: string | null): Promise<FolderRecord> {
    const ts = Date.now()
    const trimmed = preferredTitle?.replace(/\s+/g, ' ').trim() ?? ''
    const title =
      trimmed.length > 0 ? clipFolderTitle(trimmed) : nextFolderTitle(parentId, folders.value)
    const folder: FolderRecord = {
      id: newId(),
      kind: 'folder',
      title,
      parentId,
      createdAt: ts,
      updatedAt: ts,
    }
    folders.value = [...folders.value, folder]
    if (store) await store.put(folder)
    return folder
  }

  async function renameFolder(id: string, newTitle: string): Promise<void> {
    const idx = folders.value.findIndex((f) => f.id === id)
    if (idx === -1) return
    const current = folders.value[idx]
    const cleaned = sanitizeRenameInput(newTitle, current.title)
    if (cleaned == null) return
    const updated: FolderRecord = {
      ...current,
      title: cleaned,
      updatedAt: Date.now(),
    }
    folders.value.splice(idx, 1, updated)
    if (store) await store.put(updated)
  }

  async function deleteFolder(id: string): Promise<void> {
    const folderSet = collectDescendantFolderIds(id, folders.value)
    const docIdsToDelete = docs.value.filter((d) => d.folderId && folderSet.has(d.folderId)).map((d) => d.id)

    if (pendingPutId && docIdsToDelete.includes(pendingPutId)) {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      pendingPutId = null
    }

    if (store) {
      for (const did of docIdsToDelete) {
        await store.delete(did)
      }
      for (const fid of folderSet) {
        await store.delete(fid)
      }
    }

    const wasActiveDeleted = activeId.value != null && docIdsToDelete.includes(activeId.value)
    docs.value = docs.value.filter((d) => !docIdsToDelete.includes(d.id))
    folders.value = folders.value.filter((f) => !folderSet.has(f.id))

    if (!wasActiveDeleted) return

    const remaining = [...docs.value].sort((a, b) => b.updatedAt - a.updatedAt)
    const fallback = remaining[0] ?? null
    if (fallback) {
      activeId.value = fallback.id
      writeStoredActiveId(fallback.id)
      loadDocIntoEditor(fallback)
    } else {
      activeId.value = null
      writeStoredActiveId(null)
      loadDocIntoEditor(null)
    }
  }

  async function exportFolderAsZip(folderId: string): Promise<void> {
    await flush()
    const folder = folders.value.find((f) => f.id === folderId)
    if (!folder || !store) return

    const entries: Record<string, Uint8Array> = {}

    function addDocsInFolder(fid: string, path: string) {
      const childFolders = folders.value
        .filter((f) => f.parentId === fid)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      const childDocs = docs.value
        .filter((d) => (d.folderId ?? null) === fid)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      for (const cf of childFolders) {
        addDocsInFolder(cf.id, `${path}${fsSafeSegment(cf.title)}/`)
      }
      for (const d of childDocs) {
        const name = safeFilenameFromTitle(d.title)
        entries[`${path}${name}`] = strToU8(d.content)
      }
    }

    const rootPath = `${fsSafeSegment(folder.title)}/`
    addDocsInFolder(folderId, rootPath)

    if (Object.keys(entries).length === 0) {
      entries[`${rootPath}_空文件夹.txt`] = strToU8('')
    }

    const zipped = zipSync(entries, { level: 6 })
    const blob = new Blob([zipped], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fsSafeSegment(folder.title)}.zip`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function exportDocAsMarkdown(id: string): { filename: string; blob: Blob } | null {
    const doc = docs.value.find((d) => d.id === id)
    if (!doc) return null
    const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
    return { filename: safeFilenameFromTitle(doc.title), blob }
  }

  function exportActiveAsMarkdown(): { filename: string; blob: Blob } | null {
    if (!activeId.value) return null
    return exportDocAsMarkdown(activeId.value)
  }

  watch(activeContent, () => {
    if (suppressNextWatch) {
      suppressNextWatch = false
      return
    }
    if (!activeId.value) return
    scheduleAutosave()
  })

  void (async () => {
    try {
      store = await openDocStore()
      const initialActive = await runMigrationIfNeeded({
        store,
        storage: localStorage,
        defaultSampleContent: defaultSample,
      })
      const all = await store.getAll()
      const nextDocs: Doc[] = []
      const nextFolders: FolderRecord[] = []
      for (const item of all) {
        if (isFolderRecord(item)) nextFolders.push(item)
        else nextDocs.push(item)
      }
      docs.value = nextDocs
      folders.value = nextFolders
      const stored = readStoredActiveId()
      const candidate = (stored && nextDocs.find((d) => d.id === stored)) || null
      const initial =
        candidate ?? nextDocs.find((d) => d.id === initialActive) ?? sortedDocs.value[0] ?? null
      if (initial) {
        activeId.value = initial.id
        writeStoredActiveId(initial.id)
        loadDocIntoEditor(initial)
      } else {
        activeId.value = null
        loadDocIntoEditor(null)
      }
      status.value = 'ready'
    } catch (e) {
      status.value = 'unavailable'
      unavailableMessage.value =
        e instanceof Error
          ? `无法访问本地数据库：${e.message}。编辑内容将不会被持久化。`
          : '无法访问本地数据库。编辑内容将不会被持久化。'
    }
  })()

  onBeforeUnmount(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  })

  return {
    status,
    unavailableMessage,
    docs,
    folders,
    activeId,
    activeDoc,
    activeContent,
    searchQuery,
    filteredDocs,
    hasDocs,
    hasLibraryItems,
    treeMode,
    setActive,
    createEmptyDoc,
    createDocFromContent,
    loadSampleAsNewDoc,
    renameDoc,
    unlockTitle,
    deleteDoc,
    duplicateDoc,
    createFolder,
    renameFolder,
    deleteFolder,
    exportFolderAsZip,
    moveDocToFolder,
    flush,
    exportDocAsMarkdown,
    exportActiveAsMarkdown,
  }
}
