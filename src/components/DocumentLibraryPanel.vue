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
