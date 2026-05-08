<!-- src/components/DocumentLibraryPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Doc } from '@/markdown/documentStore'
import DocumentImportMenu from '@/components/DocumentImportMenu.vue'

type ImportedItem = { title: string; content: string; titleLocked: boolean }

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

const renamingId = ref<string | null>(null)
const renamingDraft = ref<string>('')
let renameInputEl: HTMLInputElement | null = null

function bindRenameInput(el: unknown) {
  renameInputEl = el instanceof HTMLInputElement ? el : null
}

type CtxMenuState =
  | { id: string; mode: 'cursor'; x: number; y: number }
  | { id: string; mode: 'kebab' }

const ctxMenu = ref<CtxMenuState | null>(null)
const ctxMenuEl = ref<HTMLElement | null>(null)

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
  ctxMenu.value = { id: doc.id, mode: 'cursor', x: ev.clientX, y: ev.clientY }
}

function openKebabMenu(doc: Doc) {
  if (ctxMenu.value && ctxMenu.value.id === doc.id && ctxMenu.value.mode === 'kebab') {
    closeContextMenu()
    return
  }
  ctxMenu.value = { id: doc.id, mode: 'kebab' }
}

function closeContextMenu() {
  ctxMenu.value = null
}

function onGlobalCtxPointerDown(ev: PointerEvent) {
  if (!ctxMenu.value) return
  if (ev.button !== 0 && ev.pointerType === 'mouse') return
  const root = ctxMenuEl.value
  const t = ev.target as Node
  if (root && !root.contains(t)) closeContextMenu()
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

function onCtxDelete() {
  if (!ctxMenu.value) return
  const id = ctxMenu.value.id
  closeContextMenu()
  if (window.confirm('确定删除该文档吗？此操作不可撤销。')) {
    emit('delete', id)
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
  () => props.activeId,
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
</script>

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
</style>
