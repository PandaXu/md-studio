import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { openDocStore, type Doc, type DocStore } from '@/markdown/documentStore'
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
  activeId: Ref<string | null>
  activeDoc: ComputedRef<Doc | null>
  activeContent: Ref<string>
  searchQuery: Ref<string>
  filteredDocs: ComputedRef<Doc[]>
  hasDocs: ComputedRef<boolean>
  setActive(id: string): Promise<void>
  createEmptyDoc(): Promise<Doc>
  createDocFromContent(content: string, opts?: { title?: string; titleLocked?: boolean }): Promise<Doc>
  loadSampleAsNewDoc(): Promise<Doc>
  renameDoc(id: string, newTitle: string): Promise<void>
  unlockTitle(id: string): Promise<void>
  deleteDoc(id: string): Promise<void>
  flush(): Promise<void>
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

export function useDocumentLibrary(): LibraryHandle {
  const status = ref<LibraryStatus>('loading')
  const unavailableMessage = ref<string | null>(null)
  const docs = ref<Doc[]>([])
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

  const filteredDocs = computed<Doc[]>(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return sortedDocs.value
    return sortedDocs.value.filter((d) => d.title.toLowerCase().includes(q))
  })

  const hasDocs = computed(() => docs.value.length > 0)

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
      if (!store) return
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
    opts?: { title?: string; titleLocked?: boolean },
  ): Promise<Doc> {
    const ts = Date.now()
    const ordinal = nextUntitledOrdinal(docs.value.map((d) => d.title))
    const title =
      opts?.title && opts.title.trim().length > 0
        ? opts.title.trim()
        : deriveTitle(content, ordinal)
    const doc: Doc = {
      id: newId(),
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

  async function createEmptyDoc(): Promise<Doc> {
    const doc = await createDocFromContent('', { titleLocked: false })
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

  function exportActiveAsMarkdown(): { filename: string; blob: Blob } | null {
    const doc = activeDoc.value
    if (!doc) return null
    const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
    return { filename: safeFilenameFromTitle(doc.title), blob }
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
      docs.value = all
      const stored = readStoredActiveId()
      const candidate = (stored && all.find((d) => d.id === stored)) || null
      const initial = candidate ?? all.find((d) => d.id === initialActive) ?? sortedDocs.value[0] ?? null
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
    activeId,
    activeDoc,
    activeContent,
    searchQuery,
    filteredDocs,
    hasDocs,
    setActive,
    createEmptyDoc,
    createDocFromContent,
    loadSampleAsNewDoc,
    renameDoc,
    unlockTitle,
    deleteDoc,
    flush,
    exportActiveAsMarkdown,
  }
}
