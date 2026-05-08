# Markdown 文档库侧栏 第 2 期 — UI 打磨与视觉刷新 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在不引入文件夹 / 回收站等架构级新能力的前提下，对第 1 期已上线的文档库侧栏完成 UI/UX 打磨：始终可见的列表项 kebab 菜单、统一的 ≡ 侧栏切换、当前文档标题进入工具栏、跟随 reading mode 的暗色主题、以及更克制的整体视觉。

**架构：** 三层小幅扩展——
1. **状态层**：`useDocumentLibrary.ts` 增量新增 `exportDocAsMarkdown(id)` 与 `duplicateDoc(id)`，原 `exportActiveAsMarkdown` 改为前者的薄封装。
2. **视图层**：`DocumentLibraryPanel.vue` 删除内部折叠条 / `Documents` 标题、新增 per-item kebab 按钮，将原右键 ctxMenu 扩展为「光标定位」「kebab 锚点」两种 mode；`MarkdownEditorView.vue` 删除大标题，工具栏首格改为 `≡ + 当前文档标题`，根容器加 `data-reading` 属性以驱动暗色侧栏。
3. **样式层**：在 `App.vue` 全局 `<style>` 中新增 `--doc-panel-*` 变量（light + `[data-reading='dark']` 两套）与全局过渡规则；`DocumentLibraryPanel.vue` / `MarkdownEditorView.vue` 各自 scoped 样式吃新变量。

**技术栈：** Vue 3 + TypeScript、Vite，沿用现有 IndexedDB 与 localStorage（无 schema / key 变更）。

**测试约定：** 仓库未配置单测框架。沿用第 1 期惯例：以 `npm run typecheck` 作为编译期回归基线；运行期验证集中在最后一个任务的「手工回归清单」。

**关联规格：** [`docs/superpowers/specs/2026-05-08-doc-library-polish-design.md`](../specs/2026-05-08-doc-library-polish-design.md)

**与规格的实现差异：** 规格 §5.1 / §5.5 提到将新 CSS 变量与全局过渡放在 `src/styles/main.css`。仓库目前没有该文件，全局样式都集中在 `src/App.vue` 的非 scoped `<style>` 中。本计划遵循现有约定将变量加入 `App.vue`，规格的"全局可被任意祖先选择器命中"目标不变。

---

## File Structure（计划变更总览）

**修改：**

| 路径 | 改动要点 |
|------|---------|
| `src/composables/useDocumentLibrary.ts` | `LibraryHandle` 新增 `exportDocAsMarkdown(id)` / `duplicateDoc(id)`；`exportActiveAsMarkdown` 改为 delegate |
| `src/App.vue` | 全局 `<style>` 新增 `--doc-panel-*` 变量（light + `[data-reading='dark']`）与全局过渡规则 |
| `src/components/DocumentLibraryPanel.vue` | 移除 `collapsed` prop / `update:collapsed` emit / `.doc-panel-collapse-bar` / `Documents` 标题；新增 kebab 按钮（每行）；`ctxMenu` 状态扩展为 `cursor` / `kebab` 两种 mode；菜单项扩展为 重命名 / 恢复跟随 H1 / 下载 / 复制一份 / 删除；scoped 样式吃新变量并按规格 §5.3 重做 |
| `src/views/MarkdownEditorView.vue` | 删除 `<h1 class="title">`；工具栏首格新增 `≡` 按钮 + `<h1 class="doc-title">{活动文档标题}</h1>`；根容器新增 `:data-reading="reading"`；`<DocumentLibraryPanel>` 改为 `v-if="!sidebarCollapsed"` 渲染并去掉 `v-model:collapsed`；新增 `downloadDocAsMd(id)` 并通过新 emit 接收 `download`/`duplicate`；scoped 样式按规格 §5.4 调整 |
| `src/styles/editor-shell.css` | 折叠态 `grid-template-columns` 由 `32px 1fr` 改为 `1fr`（侧栏整体移出 DOM，不再保留 32px 折叠条空间） |

**不修改：** `src/markdown/documentStore.ts`、`src/markdown/documentTitle.ts`、`src/markdown/documentMigration.ts`、`src/components/DocumentImportMenu.vue`、`README.md`。

---

## 任务 1：composable 扩展 — `exportDocAsMarkdown` / `duplicateDoc`

**文件：**
- 修改：`src/composables/useDocumentLibrary.ts:17-36`（`LibraryHandle` 类型签名）、`:259-264`（`exportActiveAsMarkdown` 实现）、`:313-333`（return 字段）
- 测试：`npm run typecheck`

**前置阅读：** 仓库 `src/markdown/documentStore.ts` 的 `Doc` 类型定义；`safeFilenameFromTitle` 在 `src/markdown/documentTitle.ts:39`；现状 `exportActiveAsMarkdown` 在 `src/composables/useDocumentLibrary.ts:259`。

- [ ] **步骤 1：扩展 `LibraryHandle` 签名（先红）**

把 `src/composables/useDocumentLibrary.ts:17-36` 的 `LibraryHandle` 改为：

```ts
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
  duplicateDoc(id: string): Promise<Doc | null>
  flush(): Promise<void>
  exportDocAsMarkdown(id: string): { filename: string; blob: Blob } | null
  exportActiveAsMarkdown(): { filename: string; blob: Blob } | null
}
```

- [ ] **步骤 2：运行 typecheck 验证失败**

运行：`npm run typecheck`
预期：FAIL，报错类似 `Property 'exportDocAsMarkdown' is missing in type '{...}' but required in type 'LibraryHandle'.`（return 还没补字段）。

- [ ] **步骤 3：实现 `exportDocAsMarkdown` 并改写 `exportActiveAsMarkdown`**

将 `src/composables/useDocumentLibrary.ts:259-264` 替换为：

```ts
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
```

- [ ] **步骤 4：实现 `duplicateDoc`**

在 `exportActiveAsMarkdown` 上方插入：

```ts
async function duplicateDoc(id: string): Promise<Doc | null> {
  if (id === activeId.value) await flush()
  const original = docs.value.find((d) => d.id === id)
  if (!original) return null
  const ts = Date.now()
  const dup: Doc = {
    id: newId(),
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
```

要点：
- `if (id === activeId.value) await flush()`：只有复制当前正在编辑的文档时才需要等 pending autosave 落盘到 `docs` / IndexedDB，否则跳过避免无谓延迟。
- `titleLocked` 继承原值：避免副本因 H1 一致而被 `deriveTitle` 立刻覆盖标题。
- 不调用 `setActive(dup.id)`：用户停留在原文档，列表头部出现副本但不打断当前编辑。
- IndexedDB 不可用（`store == null`）时跳过持久化，仅更新内存（与 `createDocFromContent` 行为一致）。

- [ ] **步骤 5：补 return 字段**

将 `src/composables/useDocumentLibrary.ts:313-333` 的 return 替换为：

```ts
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
  duplicateDoc,
  flush,
  exportDocAsMarkdown,
  exportActiveAsMarkdown,
}
```

- [ ] **步骤 6：运行 typecheck 验证通过**

运行：`npm run typecheck`
预期：PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/composables/useDocumentLibrary.ts
git commit -m "feat(doc-library): add exportDocAsMarkdown and duplicateDoc to library composable"
```

---

## 任务 2：全局 CSS 变量与过渡（App.vue）

**文件：**
- 修改：`src/App.vue:9-20`（`:root` 变量块）、追加全局过渡规则
- 测试：`npm run typecheck`

**前置阅读：** 现状 `src/App.vue` 全局样式块；规格 §5.1 与 §5.5。

- [ ] **步骤 1：扩展 `:root` 变量块**

把 `src/App.vue:9-20` 整段替换为：

```css
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

  /* Doc panel — light */
  --doc-panel-bg: #fafbfc;
  --doc-panel-surface: #ffffff;
  --doc-panel-text: #1f2937;
  --doc-panel-muted: #6b7280;
  --doc-panel-border: rgba(15, 23, 42, 0.06);
  --doc-panel-hover: rgba(15, 23, 42, 0.04);
  --doc-panel-active-bg: rgba(99, 102, 241, 0.08);
  --doc-panel-active-bar: #4f46e5;
}

[data-reading='dark'] {
  --doc-panel-bg: #0f1419;
  --doc-panel-surface: #161b22;
  --doc-panel-text: #e5e7eb;
  --doc-panel-muted: #9ca3af;
  --doc-panel-border: rgba(255, 255, 255, 0.08);
  --doc-panel-hover: rgba(255, 255, 255, 0.04);
  --doc-panel-active-bg: rgba(129, 140, 248, 0.16);
  --doc-panel-active-bar: #818cf8;
}
```

- [ ] **步骤 2：追加全局过渡规则**

在 `src/App.vue` 全局 `<style>` 块的末尾（`#app { ... }` 之后）追加：

```css
button,
input,
select,
.doc-panel-item {
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
```

要点：本规则只过渡颜色 / 边框 / 文本三类属性，不会干扰 `transform` 等其他动画。

- [ ] **步骤 3：运行 typecheck 验证通过**

运行：`npm run typecheck`
预期：PASS（纯 CSS 变更不会触发 TS 错误，但要确认仓库没有引入新的引用错误）。

- [ ] **步骤 4：Commit**

```bash
git add src/App.vue
git commit -m "style(app): add doc-panel theme tokens and global UI transition"
```

---

## 任务 3：DocumentLibraryPanel —— 去折叠条 / 新增 kebab / 扩展 ctxMenu / 视觉刷新

**文件：**
- 修改：`src/components/DocumentLibraryPanel.vue`（整个 SFC：`<script setup>`、`<template>`、`<style scoped>`）
- 测试：`npm run typecheck`

**前置阅读：** 现状 `src/components/DocumentLibraryPanel.vue:1-525`；规格 §3 / §5.3 / §5.6。

> 本任务变更跨 props/emits、模板与样式，但都聚焦同一个文件。按 5 步骤推进，每步可单独 typecheck。

- [ ] **步骤 1：调整 props / emits / 状态类型**

替换 `src/components/DocumentLibraryPanel.vue:9-28` 的 props 与 emits 块为：

```ts
const props = defineProps<{
  docs: readonly Doc[]
  activeId: string | null
  searchQuery: string
  hasDocs: boolean
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  select: [id: string]
  rename: [id: string, newTitle: string]
  unlockTitle: [id: string]
  delete: [id: string]
  duplicate: [id: string]
  download: [id: string]
  newDoc: []
  imported: [items: ImportedItem[]]
  importError: [message: string]
}>()
```

把 `src/components/DocumentLibraryPanel.vue:38` 的 ctxMenu 状态类型扩展为：

```ts
type CtxMenuState =
  | { id: string; mode: 'cursor'; x: number; y: number }
  | { id: string; mode: 'kebab' }

const ctxMenu = ref<CtxMenuState | null>(null)
```

并删除 `:41-42` 的 `downloadDisabled` / `deleteDisabled` 计算属性（顶部的「⬇」「🗑」按钮在步骤 3 一并被移除）。同时删除 `:128-133` 的 `onDeleteCurrent`（同理）。

- [ ] **步骤 2：扩展上下文菜单触发与项**

把 `src/components/DocumentLibraryPanel.vue:74-77` 的 `openContextMenu` 改为：

```ts
function openContextMenu(ev: MouseEvent, doc: Doc) {
  ev.preventDefault()
  ctxMenu.value = { id: doc.id, mode: 'cursor', x: ev.clientX, y: ev.clientY }
}

function openKebabMenu(doc: Doc) {
  if (ctxMenu.value && ctxMenu.value.id === doc.id && ctxMenu.value.mode === 'kebab') {
    closeContextMenu()
    return
  }
  ctxMenu.value = { id: doc.id, mode: 'kebab' }
}
```

新增两个菜单回调，紧跟在 `:117` 的 `onCtxUnlock` 后面：

```ts
function onCtxDownload() {
  if (!ctxMenu.value) return
  const id = ctxMenu.value.id
  closeContextMenu()
  emit('download', id)
}

function onCtxDuplicate() {
  if (!ctxMenu.value) return
  const id = ctxMenu.value.id
  closeContextMenu()
  emit('duplicate', id)
}
```

把 `src/components/DocumentLibraryPanel.vue:135-139` 的 `ctxLockedOnly` 保留不变，但补一个判断当前菜单是哪种 mode 的辅助：

```ts
const ctxAnchorMode = computed<'cursor' | 'kebab' | null>(() => ctxMenu.value?.mode ?? null)
```

- [ ] **步骤 3：重写模板**

把 `src/components/DocumentLibraryPanel.vue:176-312` 的整段 `<template>` 替换为：

```vue
<template>
  <aside class="doc-panel" aria-label="Documents">
    <header class="doc-panel-header">
      <div class="doc-panel-actions">
        <DocumentImportMenu
          menu-id="doc-library-import"
          @imported="(items) => emit('imported', items)"
          @error="(msg) => emit('importError', msg)"
        />
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
        :class="{ active: doc.id === activeId, 'menu-open': ctxMenu?.id === doc.id }"
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

        <button
          type="button"
          class="doc-panel-kebab"
          :aria-label="`${doc.title} 操作菜单`"
          aria-haspopup="menu"
          :aria-expanded="ctxMenu?.id === doc.id && ctxMenu?.mode === 'kebab'"
          @click.stop="openKebabMenu(doc)"
        >⋯</button>

        <ul
          v-if="ctxMenu?.id === doc.id && ctxMenu?.mode === 'kebab'"
          ref="ctxMenuEl"
          class="doc-panel-ctx-menu doc-panel-ctx-menu--kebab"
          role="menu"
          @click.self="closeContextMenu"
        >
          <li role="none">
            <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRename">重命名</button>
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
            <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDelete">删除</button>
          </li>
        </ul>
      </li>
    </ul>
    <p v-else class="doc-panel-empty-list">
      {{ hasDocs ? '未匹配到文档' : '暂无文档，点击右上角 ＋ 新建' }}
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
        <li role="none">
          <button type="button" role="menuitem" class="doc-panel-ctx-item" @click="onCtxRename">重命名</button>
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
          <button type="button" role="menuitem" class="doc-panel-ctx-item danger" @click="onCtxDelete">删除</button>
        </li>
      </ul>
    </Teleport>
  </aside>
</template>
```

要点：
- `ref="ctxMenuEl"` 同时被两个 `<ul>` 引用——但同一时刻只有一个分支在 DOM 中（mode 互斥），全局外部点击检测器仍能拿到正确的根元素。
- `@click.stop` 防止 kebab 按钮触发上层 `@click="onItemClick"` 切换文档。
- `:class` 上的 `menu-open` 让样式可以选择 hover 之外的"菜单打开期间"状态来保持 kebab 高亮。
- 移除了 `update:collapsed` 触发的 watch（步骤 4 一并清理）。
- 不再渲染顶部 `<h2>Documents</h2>` 与「⬇」「🗑」按钮（这些操作下沉到 kebab 菜单）。
- `aside` 改为始终带 `aria-label="Documents"` 提供 landmark 命名（替代删掉的 h2 文本）。

- [ ] **步骤 4：清理 `<script setup>` 中无主代码并加新的菜单收尾逻辑**

把 `src/components/DocumentLibraryPanel.vue:159-165` 的 `watch(() => props.collapsed, ...)` 替换为：

```ts
watch(
  () => props.activeId,
  () => {
    closeContextMenu()
  },
)
```

要点：切换文档（不论是用户主动点其他项还是 kebab 操作内部 `setActive`）都把菜单关掉；不再依赖已删除的 `collapsed` prop。

确认 `cancelRename` 仍在 `onSearchInput` 流程外被调用——若发现没有任何调用方，则把 `cancelRename` 与 `bindRenameInput` 整合到 `closeContextMenu` 后调用一次：

```ts
function closeContextMenu() {
  ctxMenu.value = null
}
```

（`closeContextMenu` 与 `cancelRename` 是两件不同的事，保持解耦不强行合并。）

- [ ] **步骤 5：重写 scoped 样式**

把 `src/components/DocumentLibraryPanel.vue:314-525` 的整段 `<style scoped>` 替换为：

```css
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
  justify-content: flex-end;
  padding: 0.5rem 0.65rem;
  background: transparent;
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
  color: var(--doc-panel-text);
  cursor: pointer;
  line-height: 1;
}

.doc-panel-icon-btn:hover:not(:disabled) {
  background: var(--doc-panel-hover);
}

.doc-panel-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
  min-width: 9rem;
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
```

要点：
- `.doc-panel` 整体改为列容器（删除 collapse-bar 之后，body 直接挂在 aside 内）。
- `.doc-panel-ctx-menu--kebab` 用 `position: absolute` 锚定在 `.doc-panel-item` 内部右上角；`.doc-panel-item` 的 `position: relative` 已就位。
- `border-left` 由 3px 改 2px 以匹配规格 §5.3 的"更克制"。
- 暗色 danger 颜色单独覆盖以保持对比度。

- [ ] **步骤 6：运行 typecheck 验证通过**

运行：`npm run typecheck`
预期：PASS。
潜在错误：如果父组件 (`MarkdownEditorView.vue`) 仍写着 `v-model:collapsed="..."`，typecheck 会报 `Property 'collapsed' is missing` 之类——这正是任务 4 要修复的；本任务允许暂时遗留，**不**强制此处通过。如果 typecheck 报这个错，记录并继续到任务 4。

- [ ] **步骤 7：Commit**

```bash
git add src/components/DocumentLibraryPanel.vue
git commit -m "refactor(doc-library): remove inner collapse, add per-item kebab and unified ctx menu"
```

---

## 任务 4：MarkdownEditorView —— ≡ 切换 + 文档标题 + 工具栏精简 + 视觉刷新 + 下载/复制接线

**文件：**
- 修改：`src/views/MarkdownEditorView.vue`（template 与 scoped style）、`src/styles/editor-shell.css:250-252`（折叠态 grid 列宽）
- 测试：`npm run typecheck` + 手工开发服打开页面

**前置阅读：** 现状 `src/views/MarkdownEditorView.vue:253-321`（下载与模板）、`src/styles/editor-shell.css:240-264`（侧栏栅格）；规格 §2.1 / §2.2 / §5.4。

- [ ] **步骤 1：调整 `editor-shell.css` 折叠态列宽**

把 `src/styles/editor-shell.css:250-252` 这一段：

```css
.editor-shell-with-sidebar[data-sidebar-collapsed='true'] {
  grid-template-columns: 32px 1fr;
}
```

替换为：

```css
.editor-shell-with-sidebar[data-sidebar-collapsed='true'] {
  grid-template-columns: 1fr;
}
```

理由：侧栏折叠时整个组件被 `v-if` 移出 DOM（不再保留 32px 内置折叠条），编辑区应铺满。

- [ ] **步骤 2：新增 `downloadDocAsMd` / `onDuplicate`**

在 `src/views/MarkdownEditorView.vue:253-266` 的 `downloadActiveMd` 上方插入：

```ts
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
```

把原 `downloadActiveMd`（`src/views/MarkdownEditorView.vue:253-266`）替换为薄封装：

```ts
async function downloadActiveMd() {
  if (!activeId.value) return
  await downloadDocAsMd(activeId.value)
}
```

新增复制回调，紧跟在 `onDelete` 之后：

```ts
async function onDuplicate(id: string) {
  const dup = await lib.duplicateDoc(id)
  if (!dup) return
  importBanner.value = `已创建副本：${dup.title}`
  setTimeout(() => { importBanner.value = null }, 4000)
}
```

注意：`importBanner` 已被现有 import 流程使用，此处复用其 4 秒自隐机制，不新增 state。

- [ ] **步骤 3：重写工具栏与侧栏接线**

把 `src/views/MarkdownEditorView.vue:301-321` 的根容器与 `<DocumentLibraryPanel>` 这一段：

```vue
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
```

替换为：

```vue
<div
  class="editor-shell-with-sidebar"
  :data-reading="reading"
  :data-sidebar-collapsed="sidebarCollapsed ? 'true' : 'false'"
>
  <DocumentLibraryPanel
    v-if="!sidebarCollapsed"
    v-model:search-query="searchQuery"
    :docs="filteredDocs"
    :active-id="activeId"
    :has-docs="hasDocs"
    @select="onSelect"
    @rename="onRename"
    @unlock-title="onUnlock"
    @delete="onDelete"
    @duplicate="onDuplicate"
    @download="downloadDocAsMd"
    @new-doc="onNewDoc"
    @imported="onImported"
    @import-error="onImportError"
  />
```

把 `src/views/MarkdownEditorView.vue:330-361` 的 `<header class="toolbar">` 整段替换为：

```vue
<header class="toolbar">
  <button
    type="button"
    class="toolbar-toggle"
    :aria-label="sidebarCollapsed ? '展开文档库侧栏' : '收起文档库侧栏'"
    :aria-expanded="!sidebarCollapsed"
    title="切换文档库"
    @click="sidebarCollapsed = !sidebarCollapsed"
  >≡</button>
  <h1 class="doc-title" :class="{ muted: !lib.activeDoc.value }">
    {{ lib.activeDoc.value?.title ?? '未选中文档' }}
  </h1>
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
```

要点：
- `≡` 是固定字符（不随 `sidebarCollapsed` 反转方向），符合规格 §2.1。
- `<h1 class="doc-title">` 替代原 `<h1 class="title">`，承担"页面主标题"语义；空文档时加 `muted` 类视觉弱化。
- 由于 scoped style 不能跨文件，原 `editor-shell.css` 中针对 `.editor-page .title` 的样式不会自动迁移到 `.doc-title`——`.doc-title` 的样式由步骤 4 在 scoped 中重新定义，**不**复用 `editor-shell.css` 的 `.title`。

- [ ] **步骤 4：扩展 scoped 样式**

把 `src/views/MarkdownEditorView.vue:424-453` 的 `.markdown-preview-wrap` 之前（即 `<style scoped>` 块的最开头）插入：

```css
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
```

并在该 `<style scoped>` 块的末尾（`}` 收尾之前）追加：

```css
.editor-page :deep(.toolbar) {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0.6rem 1rem;
  background: var(--surface);
}

.editor-page :deep(.hint) {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}
```

要点：
- `:deep()` 是必要的——`.toolbar` 与 `.hint` 的基础样式来自全局 `editor-shell.css` 中的 `.editor-page .toolbar` / `.editor-page .hint`，scoped 选择器需要穿透到子节点；这里只覆盖具体属性，不全面替换原规则。
- `.toolbar-toggle` / `.doc-title` 是本文件新增节点，不需要 `:deep()`。

- [ ] **步骤 5：运行 typecheck 验证通过**

运行：`npm run typecheck`
预期：PASS。
潜在错误：如果 `lib.activeDoc.value` 被 typecheck 报错（部分 Vue 配置下 `ComputedRef.value` 在 template 内可省略 `.value`），改为 `lib.activeDoc?.title ?? '未选中文档'` 并把 `:class="{ muted: !lib.activeDoc }"`——以仓库现状为准选择能编译的写法。

- [ ] **步骤 6：手工冒烟**

运行：

```bash
npm run dev
```

打开浏览器到 `/markdown` 路径，确认：
- 页面顶部不再有「Markdown 编辑与预览」大标题。
- 工具栏首格是 `≡` 按钮 + 当前文档标题。
- 点击 `≡` 侧栏整体收起，编辑区铺满；再点击展开。
- 列表项右侧出现 `⋯` 半透明按钮，hover 时变实色。

如果发现报错，先记录到 PR 描述里再回到对应步骤修复。

- [ ] **步骤 7：Commit**

```bash
git add src/views/MarkdownEditorView.vue src/styles/editor-shell.css
git commit -m "refactor(editor): toolbar toggle + doc title, wire kebab download/duplicate, dark sidebar"
```

---

## 任务 5：手工回归 + 收尾

**文件：**
- 不修改源码；按规格 §8 验收清单逐项核对

**前置阅读：** 规格 §8 验收清单。

- [ ] **步骤 1：编译期与构建烟测**

```bash
npm run typecheck
npm run build
```

预期两条命令都 PASS。如果 `build` 报"used but never defined"或 unused import，回到对应任务清理。

- [ ] **步骤 2：开发服手工回归（kebab 菜单）**

```bash
npm run dev
```

依次确认：
- [ ] 每个列表项右侧始终可见 `⋯` 按钮（默认半透明 0.35）
- [ ] hover 列表项时按钮不透明度升至 1
- [ ] 点击 `⋯` 在该项右下角弹出菜单（不超出可视区）
- [ ] 右键列表项空白处弹出同样菜单（位置在鼠标坐标）
- [ ] 5 项操作全部可用：重命名 / 恢复跟随 H1（locked 才启用）/ 下载 / 复制一份 / 删除（confirm）
- [ ] 「下载」结果与从 kebab 选另一篇时的下载一致；先 `flush` 再导出（修改后立刻下载内容应为最新）
- [ ] 「复制一份」生成 `${原标题} 副本`，列表头部插入；活动文档保持原项，banner 显示「已创建副本：xxx」，4s 自隐
- [ ] Esc / 点击菜单外都能关闭

- [ ] **步骤 3：开发服手工回归（≡ 切换 + 标题）**

- [ ] 工具栏首格是 `≡` + 文档标题
- [ ] 空库时标题显示「未选中文档」并以 `var(--muted)` 弱化
- [ ] 点击 `≡` 收起 / 展开侧栏
- [ ] 收起态：侧栏完全消失，编辑区铺满（无残留 32px 占位）
- [ ] 刷新页面（F5）后，侧栏折叠状态保留（`markdown-editor-library-collapsed`）

- [ ] **步骤 4：开发服手工回归（视觉刷新）**

- [ ] 侧栏背景 / 边框 / 列表项 hover / active 颜色全部走新 `--doc-panel-*` 变量（暗色切换有平滑 0.12s 过渡）
- [ ] 切换浅 / 深色按钮，侧栏跟随切换
- [ ] `Documents` 标题文字消失，`+` 按钮自然顶到右上
- [ ] 搜索框无 box border，只剩底线；focus 时底线变 `--doc-panel-active-bar`
- [ ] 工具栏外边框消失，下方 1px border 留下；按钮 hover 有 0.12s 过渡

- [ ] **步骤 5：开发服手工回归（已有功能）**

- [ ] 编辑、autosave、切换文档、删除、上传（本地 + URL）、HTML 导出全部可用
- [ ] FloatingSourceEditor、Mermaid、TUI、双击预览跳行全部可用
- [ ] 无新 localStorage key，无 IndexedDB schema 变化（DevTools → Application 检查）

- [ ] **步骤 6：清理与 commit**

如果 `npm run build` 提示 unused import / variable，最小化删除并 commit：

```bash
git add -p
git commit -m "chore(doc-library): cleanup after polish manual regression"
```

如果一切正常无需清理，则跳过本步。

- [ ] **步骤 7：宣告完成**

宣告本期工作完成，调用 `superpowers:finishing-a-development-branch` 收尾，让用户决定合并 / PR / 保留分支。

---

## 自检（writing-plans 必经）

**1. 规格覆盖度**

| 规格章节 | 实现任务 |
|---|---|
| §2.1 工具栏重构 | 任务 4 步骤 3 |
| §2.2 侧栏内部折叠条移除 | 任务 3 步骤 3 模板（删 collapse-bar）+ 任务 4 步骤 3（`v-if`） + 任务 4 步骤 1（grid 列宽） |
| §3.1 ctxMenu mode 扩展 | 任务 3 步骤 1-3 |
| §3.2 5 项菜单 | 任务 3 步骤 2-3 |
| §3.3 删除二次确认 | 沿用现有 `onCtxDelete` 不动（任务 3 步骤 3 模板保留 `@click="onCtxDelete"`） |
| §4.1 `exportDocAsMarkdown` / `duplicateDoc` | 任务 1 |
| §4.2 view 层 `downloadDocAsMd` | 任务 4 步骤 2 |
| §5.1 CSS 变量 | 任务 2 步骤 1 |
| §5.2 `data-reading` 属性 | 任务 4 步骤 3 |
| §5.3 侧栏视觉变更 | 任务 3 步骤 5 |
| §5.4 编辑区视觉变更 | 任务 4 步骤 4 |
| §5.5 全局过渡 | 任务 2 步骤 2 |
| §5.6 可访问性 | 任务 3 步骤 3（`aria-label="Documents"` / `aria-haspopup` / `aria-expanded`）+ 任务 4 步骤 3（`aria-expanded` on `≡`） |
| §6 兼容性 | 任务范围内未引入新 schema / key |
| §7 风险缓解（复制 banner） | 任务 4 步骤 2 `onDuplicate` 用 `importBanner` |
| §8 验收 | 任务 5 |

无遗漏。

**2. 占位符扫描**

通读全部任务步骤——每个 "实现"/"修改" 步骤都附了具体代码块或具体替换段落。无 "TODO"、"待定"、"添加适当的错误处理" 等空话。

**3. 类型一致性**

- `LibraryHandle.duplicateDoc(id: string): Promise<Doc | null>` 在任务 1 / 任务 4 一致使用。
- `LibraryHandle.exportDocAsMarkdown(id: string)` 在任务 1 / 任务 4 一致使用。
- `CtxMenuState` 在任务 3 步骤 1 定义后，步骤 2 / 3 的回调与模板都通过 `ctxMenu.value?.id` / `ctxMenu.value?.mode` 访问，未走错路径。
- `emit('download', id)` / `emit('duplicate', id)`：任务 3 emits 声明 `download: [id: string]` / `duplicate: [id: string]`，任务 4 接听 `@download="downloadDocAsMd"` / `@duplicate="onDuplicate"`，签名一致。

**4. 与第 1 期未删除字段的兼容性**

- `loadSampleAsNewDoc` 在 `useDocumentLibrary` 中保留，`MarkdownEditorView.vue` 的"加载示例"按钮仍走它（位于空库 fallback 区）—未在本期被删除。
- `cancelRename` 在删除 `watch(() => props.collapsed)` 后失去一处调用方；任务 3 步骤 4 的新 watch（`activeId` 变化）不再调用它，但 `cancelRename` 仍被 `<input @keydown.escape="cancelRename">` 使用，**未变成 dead code**。

无需补充任务。计划完整可执行。
