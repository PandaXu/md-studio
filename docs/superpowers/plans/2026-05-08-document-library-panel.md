# Markdown 文档库侧栏 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 Markdown 页左侧新增 Documents 侧栏，提供基于 IndexedDB 的多文档库（创建 / 切换 / 重命名 / 删除 / 上传 / 下载 / 搜索 / 折叠 / 老数据迁移），同时把工具栏中的「加载 .md」「下载 .md」「载入示例」入口收编进侧栏。

**架构：** 三层划分——
1. **数据层**：`documentStore.ts`（IndexedDB 适配器，可注入 `IDBFactory`）+ `documentTitle.ts`（纯函数）+ `documentMigration.ts`（一次性迁移）
2. **状态层**：`useDocumentLibrary.ts` composable，封装 `docs` / `activeId` / `activeContent` 双向绑定 + 防抖自动保存 + flush
3. **视图层**：`DocumentLibraryPanel.vue`（侧栏 UI）+ `DocumentImportMenu.vue`（上传下拉与 URL 对话框，复用现有 md-fetch 通道）+ `MarkdownEditorView.vue` 接入与工具栏精简

**技术栈：** Vue 3 + TypeScript、IndexedDB（原生 API）、Vite，沿用现有 `editor-shell.css`、`mdFetchApi` 工具与 `harness-era-article.md` 默认示例。

**测试约定：** 仓库未配置单测框架。沿用现有计划惯例：以 `npm run typecheck` 作为编译期回归基线；纯逻辑模块（`documentTitle.ts` / `documentStore.ts` / `documentMigration.ts`）的执行期验证写在最后一个任务的"手工回归清单"里。

**关联规格：** [`docs/superpowers/specs/2026-05-08-document-library-panel-design.md`](../specs/2026-05-08-document-library-panel-design.md)

---

## File Structure（计划变更总览）

**新建：**

| 路径 | 职责 |
|------|------|
| `src/markdown/documentTitle.ts` | 纯函数：`deriveTitle` / `nextUntitledOrdinal` / `sanitizeRenameInput` / `safeFilenameFromTitle` / `deriveTitleFromUrl` |
| `src/markdown/documentStore.ts` | IndexedDB 适配器：`openDocStore()` 工厂函数，`DocStore` 接口提供 `getAll` / `get` / `put` / `delete` / `count`；导出 `Doc` 类型 |
| `src/markdown/documentMigration.ts` | 一次性迁移：`runMigrationIfNeeded({store, storage, defaultSampleContent})`，返回首次 `activeId` |
| `src/composables/useDocumentLibrary.ts` | 状态编排：`docs` / `activeId` / `activeContent` / 搜索 / CRUD / 防抖自动保存 / `flush()` / `exportActiveAsMarkdown()` |
| `src/components/DocumentImportMenu.vue` | 上传下拉菜单 + 隐藏 file input + URL 对话框；通过 `imported` 事件返回新建文档 |
| `src/components/DocumentLibraryPanel.vue` | 侧栏 shell：折叠按钮、4 图标 header、搜索框、列表渲染、就地重命名、右键上下文菜单、空库态按钮 |

**修改：**

| 路径 | 改动要点 |
|------|---------|
| `src/views/MarkdownEditorView.vue` | 接入 `useDocumentLibrary`、挂载 `DocumentLibraryPanel`；移除「加载 .md」下拉、「下载 .md」「载入示例」按钮及其对应 state / 函数；保留「下载 HTML」；新增 IndexedDB 不可用顶部 banner |
| `src/styles/editor-shell.css` | 新增 `.editor-shell-with-sidebar` 网格布局；侧栏宽度变量；折叠态宽度；与现有 `.main` / `.pane` 不冲突 |

---

## 任务 1：纯函数 — 标题派生与序号工具

**文件：**
- 创建：`src/markdown/documentTitle.ts`
- 测试：`npm run typecheck`

- [ ] **步骤 1：编写失败的测试（编译期契约）**

由于仓库无运行时测试框架，将契约编码为 `.d.ts` 风格的"消费样例"放在文件顶部注释，并在任务 4 的 composable 中真正消费这些函数（届时若签名不符会编译失败）。

```ts
// src/markdown/documentTitle.ts (initial failing skeleton — function bodies missing)
export function deriveTitle(content: string, fallbackOrdinal: number): string {
  throw new Error('not implemented')
}

export function nextUntitledOrdinal(existingTitles: readonly string[]): number {
  throw new Error('not implemented')
}

export function sanitizeRenameInput(input: string, currentTitle: string): string | null {
  throw new Error('not implemented')
}

export function safeFilenameFromTitle(title: string): string {
  throw new Error('not implemented')
}

export function deriveTitleFromUrl(url: string): string {
  throw new Error('not implemented')
}
```

- [ ] **步骤 2：运行 typecheck 验证编译通过（仅签名）**

运行：`npm run typecheck`
预期：PASS（仅签名先就位，函数体后续填充）。

- [ ] **步骤 3：编写最少实现**

```ts
// src/markdown/documentTitle.ts
const TITLE_MAX = 100
const UNTITLED_PREFIX = '未命名'
const UNTITLED_REGEX = /^未命名\s+(\d+)$/

function clipTitle(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= TITLE_MAX) return trimmed
  return `${trimmed.slice(0, TITLE_MAX - 1)}…`
}

export function deriveTitle(content: string, fallbackOrdinal: number): string {
  const m = content.match(/^\s*#\s+(.+?)\s*$/m)
  if (m) {
    const cleaned = clipTitle(m[1])
    if (cleaned) return cleaned
  }
  return `${UNTITLED_PREFIX} ${fallbackOrdinal}`
}

export function nextUntitledOrdinal(existingTitles: readonly string[]): number {
  let max = 0
  for (const t of existingTitles) {
    const m = t.match(UNTITLED_REGEX)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return max + 1
}

export function sanitizeRenameInput(input: string, currentTitle: string): string | null {
  const cleaned = clipTitle(input)
  if (!cleaned) return null
  if (cleaned === currentTitle) return null
  return cleaned
}

export function safeFilenameFromTitle(title: string): string {
  const fallback = `markdown-${Date.now()}.md`
  const stripped = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
  if (!stripped) return fallback
  const clipped = stripped.length > 80 ? stripped.slice(0, 80) : stripped
  return `${clipped}.md`
}

export function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const segments = u.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last) {
      const stripped = last.replace(/\.(md|markdown)$/i, '')
      if (stripped) return clipTitle(decodeURIComponent(stripped)) || u.hostname
    }
    return u.hostname || 'URL 导入'
  } catch {
    return 'URL 导入'
  }
}
```

- [ ] **步骤 4：运行 typecheck 验证 PASS**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：人工抽查纯函数行为**

在浏览器 / Node REPL 中粘贴下列样例确认输出（可在 `node --input-type=module --eval` 中执行；或暂时加到 `src/main.ts` 顶部并在 dev server 控制台观察）：

```ts
// 期望输出：
// deriveTitle('# Hello\nbody', 3) === 'Hello'
// deriveTitle('no heading', 7) === '未命名 7'
// nextUntitledOrdinal(['未命名 1', '未命名 3', 'foo']) === 4
// sanitizeRenameInput('  ', 'old') === null
// sanitizeRenameInput('new', 'new') === null
// safeFilenameFromTitle('a/b:c') === 'abc.md'
// deriveTitleFromUrl('http://x.com/foo.md') === 'foo'
// deriveTitleFromUrl('not a url') === 'URL 导入'
```

- [ ] **步骤 6：Commit**

```bash
git add src/markdown/documentTitle.ts
git commit -m "feat(library): add pure document title utilities"
```

---

## 任务 2：IndexedDB 适配层

**文件：**
- 创建：`src/markdown/documentStore.ts`
- 测试：`npm run typecheck`

- [ ] **步骤 1：编写失败的测试（消费契约示例）**

```ts
// src/markdown/documentStore.ts (initial failing skeleton)
export type Doc = {
  id: string
  title: string
  titleLocked: boolean
  content: string
  createdAt: number
  updatedAt: number
}

export type DocStore = {
  getAll(): Promise<Doc[]>
  get(id: string): Promise<Doc | undefined>
  put(doc: Doc): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

export type OpenDocStoreOptions = {
  factory?: IDBFactory
  databaseName?: string
  databaseVersion?: number
}

export async function openDocStore(_options?: OpenDocStoreOptions): Promise<DocStore> {
  throw new Error('not implemented')
}
```

- [ ] **步骤 2：运行 typecheck 验证 PASS（签名）**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 3：实现 IndexedDB 适配器**

```ts
// src/markdown/documentStore.ts
export type Doc = {
  id: string
  title: string
  titleLocked: boolean
  content: string
  createdAt: number
  updatedAt: number
}

export type DocStore = {
  getAll(): Promise<Doc[]>
  get(id: string): Promise<Doc | undefined>
  put(doc: Doc): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

export type OpenDocStoreOptions = {
  factory?: IDBFactory
  databaseName?: string
  databaseVersion?: number
}

const DEFAULT_DB_NAME = 'md-studio'
const DEFAULT_DB_VERSION = 1
const STORE_NAME = 'documents'
const INDEX_UPDATED_AT = 'updatedAt'

function promisifyOpen(req: IDBOpenDBRequest): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(INDEX_UPDATED_AT, 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'))
  })
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function openDocStore(options?: OpenDocStoreOptions): Promise<DocStore> {
  const factory = options?.factory ?? globalThis.indexedDB
  if (!factory) throw new Error('IndexedDB is not available in this environment')
  const dbName = options?.databaseName ?? DEFAULT_DB_NAME
  const dbVersion = options?.databaseVersion ?? DEFAULT_DB_VERSION
  const db = await promisifyOpen(factory.open(dbName, dbVersion))

  function tx(mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  }

  return {
    async getAll(): Promise<Doc[]> {
      const store = tx('readonly')
      const all = await promisifyRequest(store.getAll() as IDBRequest<Doc[]>)
      return all
    },
    async get(id: string): Promise<Doc | undefined> {
      const store = tx('readonly')
      return await promisifyRequest(store.get(id) as IDBRequest<Doc | undefined>)
    },
    async put(doc: Doc): Promise<void> {
      const store = tx('readwrite')
      await promisifyRequest(store.put(doc))
    },
    async delete(id: string): Promise<void> {
      const store = tx('readwrite')
      await promisifyRequest(store.delete(id))
    },
    async count(): Promise<number> {
      const store = tx('readonly')
      return await promisifyRequest(store.count())
    },
  }
}
```

- [ ] **步骤 4：运行 typecheck 验证 PASS**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/markdown/documentStore.ts
git commit -m "feat(library): add IndexedDB document store adapter"
```

---

## 任务 3：一次性迁移工具

**文件：**
- 创建：`src/markdown/documentMigration.ts`
- 测试：`npm run typecheck`

- [ ] **步骤 1：编写失败的骨架**

```ts
// src/markdown/documentMigration.ts (initial failing skeleton)
import type { DocStore, Doc } from './documentStore'

export type MigrationDeps = {
  store: DocStore
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  defaultSampleContent: string
  now?: () => number
  uuid?: () => string
}

export async function runMigrationIfNeeded(_deps: MigrationDeps): Promise<string> {
  throw new Error('not implemented')
}
```

- [ ] **步骤 2：运行 typecheck（签名）**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 3：实现迁移逻辑**

```ts
// src/markdown/documentMigration.ts
import type { Doc, DocStore } from './documentStore'
import { deriveTitle, nextUntitledOrdinal } from './documentTitle'

const LEGACY_SOURCE_KEY = 'markdown-editor-source'

export type MigrationDeps = {
  store: DocStore
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  defaultSampleContent: string
  now?: () => number
  uuid?: () => string
}

function defaultUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function createDocFromContent(
  store: DocStore,
  opts: { title: string; titleLocked: boolean; content: string; now: () => number; uuid: () => string },
): Promise<Doc> {
  const ts = opts.now()
  const doc: Doc = {
    id: opts.uuid(),
    title: opts.title,
    titleLocked: opts.titleLocked,
    content: opts.content,
    createdAt: ts,
    updatedAt: ts,
  }
  await store.put(doc)
  return doc
}

export async function runMigrationIfNeeded(deps: MigrationDeps): Promise<string> {
  const now = deps.now ?? (() => Date.now())
  const uuid = deps.uuid ?? defaultUuid
  const count = await deps.store.count()
  if (count > 0) {
    const all = await deps.store.getAll()
    const sorted = [...all].sort((a, b) => b.updatedAt - a.updatedAt)
    return sorted[0]?.id ?? ''
  }

  let legacy: string | null = null
  try {
    legacy = deps.storage.getItem(LEGACY_SOURCE_KEY)
  } catch {
    legacy = null
  }

  if (legacy && legacy.trim().length > 0) {
    const ordinal = nextUntitledOrdinal([])
    const title = deriveTitle(legacy, ordinal)
    const doc = await createDocFromContent(deps.store, {
      title,
      titleLocked: false,
      content: legacy,
      now,
      uuid,
    })
    try {
      deps.storage.removeItem(LEGACY_SOURCE_KEY)
    } catch {
      /* ignore */
    }
    return doc.id
  }

  const doc = await createDocFromContent(deps.store, {
    title: '示例文章',
    titleLocked: false,
    content: deps.defaultSampleContent,
    now,
    uuid,
  })
  return doc.id
}
```

- [ ] **步骤 4：运行 typecheck**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/markdown/documentMigration.ts
git commit -m "feat(library): add one-shot legacy localStorage migration"
```

---

## 任务 4：useDocumentLibrary composable（库的状态层）

**文件：**
- 创建：`src/composables/useDocumentLibrary.ts`
- 测试：`npm run typecheck`

- [ ] **步骤 1：编写失败的接口骨架**

```ts
// src/composables/useDocumentLibrary.ts (initial failing skeleton)
import type { ComputedRef, Ref } from 'vue'
import type { Doc } from '@/markdown/documentStore'

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

export function useDocumentLibrary(): LibraryHandle {
  throw new Error('not implemented')
}
```

- [ ] **步骤 2：运行 typecheck（签名）**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 3：实现 composable**

```ts
// src/composables/useDocumentLibrary.ts
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
    if (pendingPutId === targetId) pendingPutId = null
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

  watch(activeContent, (next) => {
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
```

- [ ] **步骤 4：运行 typecheck**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/composables/useDocumentLibrary.ts
git commit -m "feat(library): add useDocumentLibrary composable"
```

---

## 任务 5：DocumentImportMenu 组件（上传下拉 + URL 对话框）

**文件：**
- 创建：`src/components/DocumentImportMenu.vue`
- 测试：`npm run typecheck`

复用现有 `mdFetchApi` 工具与现有 `confirmLoadUrl` 同等的 URL 校验/拉取逻辑（拷贝自当前 `MarkdownEditorView.vue`，避免直接耦合）。

- [ ] **步骤 1：编写失败的骨架**

```vue
<!-- src/components/DocumentImportMenu.vue (initial failing skeleton) -->
<script setup lang="ts">
defineProps<{
  disabled?: boolean
  menuId?: string
}>()
defineEmits<{
  imported: [items: { title: string; content: string; titleLocked: boolean }[]]
  error: [message: string]
}>()
defineExpose<{ openMenu(): void; closeMenu(): void }>()
throw new Error('DocumentImportMenu not implemented yet')
</script>

<template>
  <div />
</template>
```

- [ ] **步骤 2：运行 typecheck（签名）**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 3：实现组件**

```vue
<!-- src/components/DocumentImportMenu.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  buildMdFetchProxyUrl,
  defaultMdFetchBaseForEnv,
  isUrlFetchEnabled,
} from '@/constants/mdFetchApi'
import { deriveTitleFromUrl } from '@/markdown/documentTitle'

type ImportedItem = { title: string; content: string; titleLocked: boolean }

const props = defineProps<{
  disabled?: boolean
  menuId?: string
}>()

const emit = defineEmits<{
  imported: [items: ImportedItem[]]
  error: [message: string]
}>()

const menuOpen = ref(false)
const urlOpen = ref(false)
const urlDraft = ref('')
const urlErr = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const mdFetchBase = computed(() =>
  defaultMdFetchBaseForEnv(import.meta.env.DEV, import.meta.env.VITE_MD_FETCH_BASE),
)
const urlEnabled = computed(() => isUrlFetchEnabled(mdFetchBase.value, import.meta.env.DEV))
const urlMenuTitle = computed(() =>
  urlEnabled.value ? '' : '生产环境需在 .env 中配置 VITE_MD_FETCH_BASE 后才可从 URL 载入',
)

function openMenu() {
  if (props.disabled) return
  menuOpen.value = true
}
function closeMenu() {
  menuOpen.value = false
}
function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

defineExpose({ openMenu, closeMenu })

function pickLocalMd() {
  closeMenu()
  fileInputRef.value?.click()
}

function openUrlDialog() {
  closeMenu()
  if (!urlEnabled.value) return
  urlErr.value = null
  urlDraft.value = ''
  urlOpen.value = true
}

function closeUrlDialog() {
  urlOpen.value = false
  urlErr.value = null
}

function validateHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

async function fetchMarkdownFromProxy(target: string): Promise<string> {
  const reqUrl = buildMdFetchProxyUrl(mdFetchBase.value, target)
  const res = await fetch(reqUrl, { method: 'GET', mode: 'cors', credentials: 'omit' })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    let msg = `载入失败 (${res.status})`
    if (ct.includes('application/json')) {
      try {
        const data = (await res.json()) as { error?: string }
        if (typeof data.error === 'string' && data.error) msg = data.error
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg)
  }
  return await res.text()
}

async function confirmUrl() {
  if (!urlEnabled.value) return
  urlErr.value = null
  const u = validateHttpUrl(urlDraft.value)
  if (!u) {
    urlErr.value = '请输入有效的 http 或 https 绝对 URL'
    return
  }
  try {
    const text = await fetchMarkdownFromProxy(u.href)
    emit('imported', [
      { title: deriveTitleFromUrl(u.href), content: text, titleLocked: true },
    ])
    closeUrlDialog()
  } catch (e) {
    urlErr.value = e instanceof Error ? e.message : String(e)
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(file.name + ' 读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

async function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  const items: ImportedItem[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      const content = await readFileAsText(file)
      const stripped = file.name.replace(/\.(md|markdown|txt)$/i, '')
      items.push({
        title: stripped || file.name,
        content,
        titleLocked: true,
      })
    } catch (e) {
      errors.push(file.name)
    }
  }
  if (items.length) emit('imported', items)
  if (errors.length) {
    emit(
      'error',
      `导入完成：成功 ${items.length}/${files.length}${
        errors.length ? `，失败 ${errors.length} 个：${errors.join(', ')}` : ''
      }`,
    )
  }
}

function onGlobalPointerDown(ev: PointerEvent) {
  if (!menuOpen.value) return
  const root = document.getElementById(props.menuId ?? 'doc-import-menu-root')
  const t = ev.target as Node
  if (root && !root.contains(t)) closeMenu()
}

function onGlobalKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (urlOpen.value) closeUrlDialog()
  else if (menuOpen.value) closeMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
  document.addEventListener('keydown', onGlobalKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div :id="menuId ?? 'doc-import-menu-root'" class="doc-import-wrap">
    <button
      type="button"
      class="doc-import-trigger"
      :disabled="disabled"
      :aria-disabled="disabled || undefined"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :aria-controls="menuId ?? 'doc-import-menu'"
      title="导入 Markdown"
      aria-label="导入 Markdown"
      @click="toggleMenu"
    >
      <slot>⬆</slot>
    </button>
    <ul
      v-show="menuOpen"
      :id="menuId ?? 'doc-import-menu'"
      class="doc-import-menu"
      role="menu"
      aria-label="导入 Markdown"
    >
      <li role="none">
        <button type="button" class="doc-import-menu-item" role="menuitem" @click="pickLocalMd">
          从本地选择…（可多选）
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          class="doc-import-menu-item"
          role="menuitem"
          :disabled="!urlEnabled"
          :title="urlMenuTitle"
          @click="openUrlDialog"
        >
          从 URL 载入…
        </button>
      </li>
    </ul>
    <input
      ref="fileInputRef"
      type="file"
      class="doc-import-hidden-file"
      accept=".md,.markdown,.txt,text/markdown,text/plain"
      multiple
      aria-hidden="true"
      tabindex="-1"
      @change="onPickFile"
    />

    <Teleport to="body">
      <div
        v-if="urlOpen"
        class="doc-import-overlay"
        role="presentation"
        @click.self="closeUrlDialog"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-import-url-title"
          class="doc-import-dialog"
          @click.stop
        >
          <h3 id="doc-import-url-title" class="doc-import-dialog-title">从 URL 载入 Markdown</h3>
          <label class="doc-import-url-label">
            <span class="doc-import-url-label-text">URL</span>
            <input
              v-model.trim="urlDraft"
              type="url"
              class="doc-import-url-input"
              autocomplete="off"
            />
          </label>
          <p v-if="urlErr" class="doc-import-err" role="alert">{{ urlErr }}</p>
          <div class="doc-import-dialog-actions">
            <button type="button" class="ghost-btn" @click="closeUrlDialog">取消</button>
            <button type="button" class="primary-btn" @click="confirmUrl">载入</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.doc-import-wrap {
  position: relative;
  display: inline-block;
}

.doc-import-trigger {
  font: inherit;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text, #111);
  cursor: pointer;
  line-height: 1;
}

.doc-import-trigger:hover:not(:disabled) {
  border-color: var(--border, #e5e7eb);
  background: var(--bg, #f4f5f7);
}

.doc-import-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-import-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 12rem;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  z-index: 30;
}

.doc-import-menu-item {
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

.doc-import-menu-item:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.08);
}

.doc-import-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.doc-import-hidden-file {
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

.doc-import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
}

.doc-import-dialog {
  width: min(520px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
}

.doc-import-dialog-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.doc-import-url-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
}

.doc-import-url-label-text {
  color: var(--muted, #5c6578);
}

.doc-import-url-input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
}

.doc-import-err {
  margin: 0.5rem 0 0;
  color: #b45309;
  font-size: 0.8125rem;
}

.doc-import-dialog-actions {
  margin-top: 0.85rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
```

- [ ] **步骤 4：运行 typecheck**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/components/DocumentImportMenu.vue
git commit -m "feat(library): add DocumentImportMenu (file picker + URL dialog)"
```

---

## 任务 6：DocumentLibraryPanel 组件（侧栏 UI）

**文件：**
- 创建：`src/components/DocumentLibraryPanel.vue`
- 测试：`npm run typecheck`

- [ ] **步骤 1：编写失败的骨架**

```vue
<!-- src/components/DocumentLibraryPanel.vue (initial failing skeleton) -->
<script setup lang="ts">
import type { Doc } from '@/markdown/documentStore'

defineProps<{
  collapsed: boolean
  docs: readonly Doc[]
  activeId: string | null
  searchQuery: string
  hasDocs: boolean
}>()

defineEmits<{
  'update:collapsed': [value: boolean]
  'update:searchQuery': [value: string]
  select: [id: string]
  rename: [id: string, newTitle: string]
  unlockTitle: [id: string]
  delete: [id: string]
  newDoc: []
  download: []
  imported: [items: { title: string; content: string; titleLocked: boolean }[]]
  importError: [message: string]
  loadSample: []
}>()

throw new Error('DocumentLibraryPanel not implemented yet')
</script>

<template>
  <aside />
</template>
```

- [ ] **步骤 2：运行 typecheck（签名）**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 3：实现组件**

```vue
<!-- src/components/DocumentLibraryPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Doc } from '@/markdown/documentStore'
import DocumentImportMenu from '@/components/DocumentImportMenu.vue'

type ImportedItem = { title: string; content: string; titleLocked: boolean }

const props = defineProps<{
  collapsed: boolean
  docs: readonly Doc[]
  activeId: string | null
  searchQuery: string
  hasDocs: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  'update:searchQuery': [value: string]
  select: [id: string]
  rename: [id: string, newTitle: string]
  unlockTitle: [id: string]
  delete: [id: string]
  newDoc: []
  download: []
  imported: [items: ImportedItem[]]
  importError: [message: string]
  loadSample: []
}>()

const renamingId = ref<string | null>(null)
const renamingDraft = ref<string>('')
let renameInputEl: HTMLInputElement | null = null

function bindRenameInput(el: unknown) {
  renameInputEl = el instanceof HTMLInputElement ? el : null
}

const ctxMenu = ref<{ id: string; x: number; y: number } | null>(null)

const downloadDisabled = computed(() => !props.activeId)
const deleteDisabled = computed(() => !props.activeId)

function startRename(doc: Doc) {
  renamingId.value = doc.id
  renamingDraft.value = doc.title
  void nextTick(() => {
    renameInputEl?.focus()
    renameInputEl?.select()
  })
}

function commitRename() {
  if (!renamingId.value) return
  emit('rename', renamingId.value, renamingDraft.value)
  renamingId.value = null
  renamingDraft.value = ''
}

function cancelRename() {
  renamingId.value = null
  renamingDraft.value = ''
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
  ctxMenu.value = { id: doc.id, x: ev.clientX, y: ev.clientY }
}

function closeContextMenu() {
  ctxMenu.value = null
}

function onCtxRename() {
  if (!ctxMenu.value) return
  const doc = props.docs.find((d) => d.id === ctxMenu.value!.id)
  closeContextMenu()
  if (doc) startRename(doc)
}

function onCtxUnlock() {
  if (!ctxMenu.value) return
  const id = ctxMenu.value.id
  closeContextMenu()
  emit('unlockTitle', id)
}

function onCtxDelete() {
  if (!ctxMenu.value) return
  const id = ctxMenu.value.id
  closeContextMenu()
  if (window.confirm('确定删除该文档吗？此操作不可撤销。')) {
    emit('delete', id)
  }
}

function onDeleteCurrent() {
  if (!props.activeId) return
  if (window.confirm('确定删除当前文档吗？此操作不可撤销。')) {
    emit('delete', props.activeId)
  }
}

const ctxLockedOnly = computed(() => {
  if (!ctxMenu.value) return false
  const d = props.docs.find((x) => x.id === ctxMenu.value!.id)
  return !!d?.titleLocked
})

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
  () => props.collapsed,
  () => {
    cancelRename()
    closeContextMenu()
  },
)

function onSearchInput(ev: Event) {
  emit('update:searchQuery', (ev.target as HTMLInputElement).value)
}

function onClearSearch() {
  emit('update:searchQuery', '')
}
</script>

<template>
  <aside class="doc-panel" :class="{ collapsed }">
    <div class="doc-panel-collapse-bar">
      <button
        type="button"
        class="doc-panel-collapse-btn"
        :title="collapsed ? '展开侧栏' : '折叠侧栏'"
        :aria-label="collapsed ? '展开侧栏' : '折叠侧栏'"
        :aria-expanded="!collapsed"
        @click="emit('update:collapsed', !collapsed)"
      >
        {{ collapsed ? '▶' : '◀' }}
      </button>
    </div>
    <div v-if="!collapsed" class="doc-panel-body">
      <header class="doc-panel-header">
        <h2 class="doc-panel-title">Documents</h2>
        <div class="doc-panel-actions">
          <DocumentImportMenu
            menu-id="doc-library-import"
            @imported="(items) => emit('imported', items)"
            @error="(msg) => emit('importError', msg)"
          />
          <button
            type="button"
            class="doc-panel-icon-btn"
            :disabled="downloadDisabled"
            :aria-disabled="downloadDisabled || undefined"
            title="导出当前为 .md"
            aria-label="导出当前为 .md"
            @click="emit('download')"
          >⬇</button>
          <button
            type="button"
            class="doc-panel-icon-btn"
            :disabled="deleteDisabled"
            :aria-disabled="deleteDisabled || undefined"
            title="删除当前文档"
            aria-label="删除当前文档"
            @click="onDeleteCurrent"
          >🗑</button>
          <button
            type="button"
            class="doc-panel-icon-btn"
            title="新建空文档"
            aria-label="新建空文档"
            @click="emit('newDoc')"
          >＋</button>
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
          aria-label="清空搜索"
          @click="onClearSearch"
        >×</button>
      </div>

      <ul v-if="docs.length" class="doc-panel-list" role="listbox" aria-label="文档列表">
        <li
          v-for="doc in docs"
          :key="doc.id"
          role="option"
          class="doc-panel-item"
          :class="{ active: doc.id === activeId }"
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
          <div class="doc-panel-item-meta">{{ formatTimestamp(doc.updatedAt) }}</div>
        </li>
      </ul>
      <p v-else class="doc-panel-empty-list">未匹配到文档</p>
    </div>

    <Teleport to="body">
      <ul
        v-if="ctxMenu"
        class="doc-panel-ctx-menu"
        role="menu"
        :style="{ top: `${ctxMenu.y}px`, left: `${ctxMenu.x}px` }"
        @click.self="closeContextMenu"
      >
        <li role="none">
          <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRename">
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
            恢复跟随 H1
          </button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDelete">
            删除
          </button>
        </li>
      </ul>
    </Teleport>
  </aside>
</template>

<style scoped>
.doc-panel {
  display: flex;
  flex-direction: row;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  overflow: hidden;
  min-width: 0;
}

.doc-panel-collapse-bar {
  flex: 0 0 32px;
  background: var(--bg, #f4f5f7);
  border-right: 1px solid var(--border, #e5e7eb);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 0.5rem 0;
}

.doc-panel.collapsed .doc-panel-collapse-bar {
  border-right: none;
}

.doc-panel-collapse-btn {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--muted, #5c6578);
  cursor: pointer;
}

.doc-panel-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.doc-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--bg, #f4f5f7);
}

.doc-panel-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text, #111);
}

.doc-panel-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.doc-panel-icon-btn {
  font: inherit;
  font-size: 0.95rem;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text, #111);
  cursor: pointer;
  line-height: 1;
}

.doc-panel-icon-btn:hover:not(:disabled) {
  border-color: var(--border, #e5e7eb);
  background: var(--surface, #fff);
}

.doc-panel-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-panel-search {
  position: relative;
  padding: 0.45rem 0.55rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.doc-panel-search-input {
  width: 100%;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 1.6rem 0.35rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--text, #111);
  box-sizing: border-box;
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
  color: var(--muted, #5c6578);
}

.doc-panel-list {
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 6rem;
}

.doc-panel-item {
  position: relative;
  padding: 0.45rem 0.65rem 0.45rem 0.85rem;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.doc-panel-item:hover {
  background: rgba(99, 102, 241, 0.06);
}

.doc-panel-item.active {
  background: rgba(99, 102, 241, 0.12);
  border-left-color: var(--accent, #2563eb);
}

.doc-panel-item-title {
  font-size: 0.85rem;
  color: var(--text, #111);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-panel-item-meta {
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--muted, #5c6578);
}

.doc-panel-rename-input {
  width: 100%;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  border: 1px solid var(--accent, #2563eb);
  background: var(--surface, #fff);
  box-sizing: border-box;
}

.doc-panel-empty-list {
  margin: 0.85rem 0.65rem;
  font-size: 0.8125rem;
  color: var(--muted, #5c6578);
  text-align: center;
}

.doc-panel-ctx-menu {
  position: fixed;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 9rem;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  z-index: 60;
}

.doc-panel-ctx-item {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.4rem 0.85rem;
  border: none;
  background: transparent;
  color: var(--text, #111);
  cursor: pointer;
}

.doc-panel-ctx-item:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.08);
}

.doc-panel-ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-panel-ctx-item.danger {
  color: #b91c1c;
}
</style>
```

- [ ] **步骤 4：运行 typecheck**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/components/DocumentLibraryPanel.vue
git commit -m "feat(library): add DocumentLibraryPanel sidebar UI"
```

---

## 任务 7：editor-shell.css 新增侧栏布局

**文件：**
- 修改：`src/styles/editor-shell.css`
- 测试：`npm run typecheck`（CSS 不在 TS 检查范围；通过 dev server 视觉验证）

- [ ] **步骤 1：编写失败的视觉契约**

```text
契约：
1) .editor-shell-with-sidebar 容器使用 grid 布局：grid-template-columns: var(--doc-sidebar-w, 240px) 1fr
2) [data-sidebar-collapsed="true"] 时第一列宽度为 32px
3) 侧栏在 max-width: 720px 下自动堆叠为上下排列
4) 现有 .editor-page 内部布局（toolbar / main / pane）不受影响
```

- [ ] **步骤 2：实现样式（追加到文件末尾）**

```css
/* === Document Library sidebar layout === */

.editor-shell-with-sidebar {
  display: grid;
  grid-template-columns: var(--doc-sidebar-w, 240px) 1fr;
  gap: 0.75rem;
  align-items: stretch;
  min-height: calc(100vh - 4rem);
}

.editor-shell-with-sidebar[data-sidebar-collapsed='true'] {
  grid-template-columns: 32px 1fr;
}

.editor-shell-with-sidebar > .editor-page {
  min-width: 0;
  padding: 0;
}

@media (max-width: 720px) {
  .editor-shell-with-sidebar,
  .editor-shell-with-sidebar[data-sidebar-collapsed='true'] {
    grid-template-columns: 1fr;
  }
}

.doc-library-banner {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: 8px;
  color: var(--error-text);
}
```

- [ ] **步骤 3：运行 typecheck**

运行：`npm run typecheck`
预期：PASS（CSS 无类型影响）。

- [ ] **步骤 4：Commit**

```bash
git add src/styles/editor-shell.css
git commit -m "style(library): add sidebar grid layout for doc panel"
```

---

## 任务 8：MarkdownEditorView 接入侧栏与工具栏精简

**文件：**
- 修改：`src/views/MarkdownEditorView.vue`
- 测试：`npm run typecheck`

此任务一次性完成接入与移除：移除 `loadStoredSource` / `persistSource` / `loadMenuOpen` / `loadUrlOpen` / `loadUrlDraft` / `loadErr` / `fileInputRef` / `pickLocalMd` / `openLoadUrlDialog` / `confirmLoadUrl` / `onPickFile` / `applyLoadedMarkdown` / `onGlobalPointerDown`（仅 loadMenu 部分）/ `loadSample` / `exportMd` 与对应模板片段；接入 `useDocumentLibrary` + `DocumentLibraryPanel`；保留 `exportHtml`、阅读 / 图表 / 编辑模式 / 视图布局 / `topError` / `FloatingSourceEditor` 等所有现有能力。

- [ ] **步骤 1：编写失败的契约（视图层集成预期）**

```text
契约：
1) 顶层模板根用 .editor-shell-with-sidebar 包裹，左列 DocumentLibraryPanel，右列原 .editor-page
2) source ref 由 useDocumentLibrary().activeContent 提供（双向绑定到 SourceEditor / TuiEditor）
3) 工具栏只剩：阅读模式 / 图表主题 / 编辑模式 / 视图布局 / 下载 HTML
4) 当 lib.status === 'unavailable' 时，sidebar 上方显示一条红色 banner
5) 当 !lib.hasDocs 时，编辑/预览区显示空库态：[新建空文档] [加载示例]
6) localStorage['markdown-editor-source'] 不再被读写（迁移由 useDocumentLibrary 完成）
```

- [ ] **步骤 2：运行 typecheck（在改动前确认基线 PASS）**

运行：`npm run typecheck`
预期：PASS（基线）。

- [ ] **步骤 3：完整重写 `MarkdownEditorView.vue` 的 `<script setup>` 与 `<template>`**

**保留并替换**：完整文件如下（注意 `<style>` 部分保留原有所有 CSS——只替换 script 与 template）。

```vue
<!-- src/views/MarkdownEditorView.vue (script & template only; <style> unchanged from before) -->
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
      @load-sample="onLoadSample"
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
/* === Existing markdown-body / preview / mermaid styles preserved below === */
/* Paste the entire pre-existing <style scoped> block from the previous version of this file
   (everything starting with `.markdown-preview-wrap { ... }` through the end), unchanged. */

/* Then append new styles for the empty state: */
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
```

**重要提示：**`<style>` 块保留所有现有 CSS（约 326 行：`.markdown-preview-wrap` 到 `.load-md-dialog-actions` 等），仅在末尾追加 `.doc-empty-state` 等三条新规则。`load-md-*` 系列 CSS 已不再被模板引用，但**保留它们**避免与可能的旧引用冲突；如果在视觉验证后确认无引用，可在任务 9 末尾单独清理。

- [ ] **步骤 4：运行 typecheck 验证 PASS**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/views/MarkdownEditorView.vue
git commit -m "feat(library): wire DocumentLibraryPanel into MarkdownEditorView and slim toolbar"
```

---

## 任务 9：手工回归与清理

**文件：**
- 测试：`npm run dev` + 浏览器手测；可能修改 `src/views/MarkdownEditorView.vue`（清理已无引用的旧 CSS）

- [ ] **步骤 1：跑构建与类型检查基线**

运行：
```bash
npm run typecheck
npm run build
```
预期：两者均 PASS。

- [ ] **步骤 2：执行规格 §10 完整 DoD 清单**

启动：`npm run dev`，按下列清单逐项验证：

```text
[库管理]
□ 首次进入：库为空 → 显示空库态 → 点"加载示例" → 出现一篇"示例文章"，编辑器渲染示例
□ 再次进入：库内有"示例文章"，未弹出迁移；activeId 仍是上次的
□ 点"+"：新建一篇"未命名 1"，编辑器为空，焦点在编辑器中（focus 由 TUI / Monaco 自身负责，最小验收：可立即输入）
□ 输入 "# Hello world"，等 ~400ms：列表中标题更新为 "Hello world"
□ 双击列表项 → 进入 input → 输入 "我的笔记" → Enter → 标题改为"我的笔记"，再改正文 H1，列表标题不变（已锁定）
□ 右键列表项 → "恢复跟随 H1" → 标题立即变回 H1 文本
□ 上传：点 ⬆ → 从本地选择 → 多选 2 个 .md → 出现 2 篇新文档，切到第一篇
□ 上传 URL：点 ⬆ → 从 URL 载入 → 输入一个公开 .md raw URL → 成功导入为新文档
□ 下载：点 ⬇ → 浏览器下载当前文档为 .md，文件名 = 当前标题
□ 删除：点 🗑 → confirm 二次确认 → 切换到上一篇；连续删完最后一篇 → 进入空库态
□ 搜索：输入关键字 → 列表实时过滤；点 × → 恢复全量
□ 折叠：点 ◀ → 侧栏只剩 32px 窄条；点 ▶ → 展开；刷新页面后保持上次状态

[工具栏]
□ 阅读浅 / 深、图表主题、编辑模式 Raw/WYSIWYG、视图布局 split/code/preview 行为完全一致
□ 工具栏右侧仅剩"下载 HTML"按钮；不再有"加载 .md""下载 .md""载入示例"
□ 「下载 HTML」可正常导出

[渲染管线]
□ Mermaid 块渲染正常，主题切换生效
□ split 布局下，正文输入仍走防抖 320ms 进入预览
□ code 布局 + WYSIWYG 模式：TUI Editor 工作；切换文档时 TUI 重 mount（key 变更）
□ preview 布局下双击 [data-line] 区域：FloatingSourceEditor 打开并跳行号

[数据]
□ 切换文档时不丢字（在文档 A 输入未防抖完成 → 立刻切到 B → 切回 A：内容完整）
□ 刷新页面后 stays on 上次选中的文档
□ 老用户（手动模拟：在 dev tools 中先恢复 localStorage['markdown-editor-source']="# Old\nbody"，删除整个 IndexedDB 库后刷新）：自动迁移成一篇文档，旧 key 被清除
□ IndexedDB 不可用模拟：在 dev tools 中临时禁用 indexedDB（无痛快办法时用 throw 改造观察）→ 顶部红条 banner 出现，编辑可继续但刷新后内容丢失

[Mermaid 页]
□ 切到 /mermaid → 一切照旧，未受影响
```

- [ ] **步骤 3：清理无用的旧 CSS（可选，确认无引用后）**

确认 `MarkdownEditorView.vue` 模板已不再使用 `.load-md-*` 类后，删除 `<style scoped>` 中以下规则段：`.load-md-wrap` / `.load-md-menu` / `.load-md-menu-item` / `.load-md-menu-item:hover` / `.load-md-menu-item:disabled` / `.visually-hidden` / `.load-md-overlay` / `.load-md-dialog` / `.load-md-dialog-title` / `.load-md-url-label` / `.load-md-url-label-text` / `.load-md-url-input` / `.load-md-err` / `.load-md-dialog-actions`。

- [ ] **步骤 4：再次运行 typecheck + build**

运行：
```bash
npm run typecheck
npm run build
```
预期：两者均 PASS。

- [ ] **步骤 5：Commit（可选清理）**

```bash
git add src/views/MarkdownEditorView.vue
git commit -m "chore: remove unused load-md CSS classes after panel integration"
```

- [ ] **步骤 6：更新 README**

在 `README.md` 的"功能概览"中"Markdown 页"小节首项前增加一行：

```md
- 左侧 Documents 侧栏：基于 IndexedDB 的多文档库（新建 / 切换 / 重命名 / 删除 / 上传 / 下载 / 搜索 / 折叠 / 老数据自动迁移）
```

并将"Markdown 页"中"导出 .md 与 .html"一行调整为"导出 .md（侧栏 ⬇ 图标）与 .html（工具栏「下载 HTML」）"。

```bash
git add README.md
git commit -m "docs: mention document library sidebar in README"
```

---

## 自检：规格覆盖回扫

| 规格章节 | 实现位置 |
|---------|---------|
| §3.1 页面结构 | 任务 7（CSS）+ 任务 8（模板） |
| §3.2 组件拆分 | 任务 1-6（按文件创建） |
| §4.1 IndexedDB 结构 | 任务 2 `documentStore.ts` |
| §4.2 文档对象 schema | 任务 2 `Doc` 类型 |
| §4.3 localStorage Key | 任务 4 `ACTIVE_ID_KEY` + 任务 8 `SIDEBAR_COLLAPSED_KEY` |
| §4.4 写入节奏（autosave + flush） | 任务 4 `scheduleAutosave` / `flush` / `setActive` |
| §4.5 容量与性能（一次性 getAll） | 任务 4 启动逻辑 |
| §5.1 deriveTitle | 任务 1 |
| §5.2 状态机（titleLocked） | 任务 4 `renameDoc` / `unlockTitle` / `doFlush` |
| §5.3 命名规则（未命名 N / 100 字截断 / 空输入忽略） | 任务 1 `clipTitle` / `nextUntitledOrdinal` / `sanitizeRenameInput` |
| §5.4 重命名不刷新 updatedAt | 任务 4 `renameDoc` 不写 `updatedAt` |
| §6.1 4 图标按钮（含库空禁用） | 任务 6 `downloadDisabled` / `deleteDisabled` |
| §6.2 搜索（实时 / 子串 / 不区分大小写 / × 清空 / 空匹配文案） | 任务 4 `filteredDocs` + 任务 6 模板 |
| §6.3 列表项交互（单击 / 双击 / 右键 / 切换时滚顶） | 任务 6 + 任务 8 切换 watch 滚顶 |
| §6.4 上传流（多文件汇总） | 任务 5 `onPickFile` + 任务 8 `onImported` |
| §6.5 重命名 / 恢复跟随 H1 | 任务 4 |
| §6.6 边界态（空库态 / 删完不重建 / activeId 失效 / IndexedDB 不可用） | 任务 4 启动 + 任务 8 模板 |
| §7 工具栏精简 | 任务 8 模板移除三按钮 |
| §8 迁移流 | 任务 3 `runMigrationIfNeeded` |
| §9.1 错误展示（红条 banner 双层级） | 任务 7 `.doc-library-banner` + 任务 8 模板 `unavailableMessage` 在上、`topError` 在 preview pane 内 |
| §9.2 无障碍 | 任务 5/6 `aria-*` 属性 |
| §10 测试与验收 | 任务 9 |
| §11 与现有规格关系 | 任务 8 复用 mdFetchApi、不动渲染管线 |
| §12 风险（TUI key 重置 / IDB 注入测试 / autosave flush） | 任务 4 + 任务 8 `:key="activeId ?? 'no-doc'"` |

**遗漏检查：** 已逐项对照，无遗漏。

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-05-08-document-library-panel.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**

**如果选择子代理驱动：**
- 必需子技能：使用 superpowers:subagent-driven-development
- 每个任务一个新子代理 + 两阶段审查

**如果选择内联执行：**
- 必需子技能：使用 superpowers:executing-plans
- 批量执行并设有检查点供审查
