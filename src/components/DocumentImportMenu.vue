<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { strFromU8, unzipSync } from 'fflate'
import {
  buildMdFetchProxyUrl,
  defaultMdFetchBaseForEnv,
  isUrlFetchEnabled,
} from '@/constants/mdFetchApi'
import { deriveTitleFromUrl } from '@/markdown/documentTitle'

export type ImportedItem = { title: string; content: string; titleLocked: boolean }

export type DocLibraryImportPayload = {
  items: ImportedItem[]
  /** 非 null 时表示导入到该文件夹下 */
  folderId: string | null
}

const props = defineProps<{
  disabled?: boolean
  menuId?: string
}>()

const emit = defineEmits<{
  imported: [payload: DocLibraryImportPayload]
  error: [message: string]
}>()

const menuOpen = ref(false)
const urlOpen = ref(false)
const urlDraft = ref('')
const urlErr = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuTeleportRef = ref<HTMLElement | null>(null)

/** 下一次文件 / URL 导入的目标文件夹；工具栏导入为 null */
const pendingFolderForImport = ref<string | null>(null)

const menuFixedStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
  minWidth: '12rem',
})

const mdFetchBase = computed(() =>
  defaultMdFetchBaseForEnv(import.meta.env.DEV, import.meta.env.VITE_MD_FETCH_BASE),
)
const urlEnabled = computed(() => isUrlFetchEnabled(mdFetchBase.value, import.meta.env.DEV))
const urlMenuTitle = computed(() =>
  urlEnabled.value ? '' : '生产环境需在 .env 中配置 VITE_MD_FETCH_BASE 后才可从 URL 载入',
)

function updateMenuPosition() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const minW = Math.max(r.width, 192)
  menuFixedStyle.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + 4)}px`,
    left: `${Math.round(r.left)}px`,
    minWidth: `${Math.round(minW)}px`,
    zIndex: '90',
  }
}

function bindMenuPositionListeners() {
  window.addEventListener('scroll', updateMenuPosition, true)
  window.addEventListener('resize', updateMenuPosition)
}

function unbindMenuPositionListeners() {
  window.removeEventListener('scroll', updateMenuPosition, true)
  window.removeEventListener('resize', updateMenuPosition)
}

function openMenu() {
  if (props.disabled) return
  menuOpen.value = true
  void nextTick(() => {
    updateMenuPosition()
    bindMenuPositionListeners()
  })
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  unbindMenuPositionListeners()
}

function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

defineExpose({ openMenu, closeMenu, openLocalPickerForFolder })

function emitImported(items: ImportedItem[]) {
  if (!items.length) return
  emit('imported', { items, folderId: pendingFolderForImport.value })
  pendingFolderForImport.value = null
}

function pickLocalMd() {
  pendingFolderForImport.value = null
  closeMenu()
  queueMicrotask(() => {
    fileInputRef.value?.click()
  })
}

/** 从文件夹菜单等入口：打开本地文件选择，导入到指定文件夹 */
function openLocalPickerForFolder(folderId: string) {
  pendingFolderForImport.value = folderId
  closeMenu()
  queueMicrotask(() => {
    fileInputRef.value?.click()
  })
}

function openUrlDialog() {
  pendingFolderForImport.value = null
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
  if (!res.ok) {
    let msg = `载入失败 (${res.status})`
    const raw = await res.text().catch(() => '')
    if (raw) {
      try {
        const data = JSON.parse(raw) as { error?: unknown }
        if (typeof data.error === 'string' && data.error) msg = data.error
      } catch {
        /* not JSON, keep default msg */
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
    emitImported([{ title: deriveTitleFromUrl(u.href), content: text, titleLocked: true }])
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

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error(file.name + ' 读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

function mdItemsFromZipBuffer(buf: ArrayBuffer): ImportedItem[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buf))
  } catch {
    return []
  }
  const items: ImportedItem[] = []
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/')) continue
    if (!/\.(md|markdown|txt)$/i.test(path)) continue
    const name = path.replace(/^.*[/\\]/, '')
    const stripped = name.replace(/\.(md|markdown|txt)$/i, '')
    items.push({
      title: stripped || name,
      content: strFromU8(data, true),
      titleLocked: true,
    })
  }
  return items
}

async function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) {
    pendingFolderForImport.value = null
    return
  }

  const items: ImportedItem[] = []
  const errors: string[] = []

  for (const file of files) {
    const lower = file.name.toLowerCase()
    try {
      if (lower.endsWith('.zip')) {
        const buf = await readFileAsArrayBuffer(file)
        const fromZip = mdItemsFromZipBuffer(buf)
        if (!fromZip.length) {
          errors.push(file.name)
          continue
        }
        items.push(...fromZip)
        continue
      }
      const content = await readFileAsText(file)
      const stripped = file.name.replace(/\.(md|markdown|txt)$/i, '')
      items.push({
        title: stripped || file.name,
        content,
        titleLocked: true,
      })
    } catch {
      errors.push(file.name)
    }
  }

  if (items.length) emitImported(items)
  else pendingFolderForImport.value = null

  if (errors.length) {
    emit(
      'error',
      items.length
        ? `部分文件未导入：${errors.join('、')}（已导入 ${items.length} 个文档）`
        : `导入失败：${errors.join('、')}`,
    )
  }
}

function onGlobalPointerDown(ev: PointerEvent) {
  if (!menuOpen.value) return
  const t = ev.target as Node | null
  if (!t) return
  const wrap = wrapRef.value
  const menu = menuTeleportRef.value
  if (wrap?.contains(t)) return
  if (menu?.contains(t)) return
  closeMenu()
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
  unbindMenuPositionListeners()
})
</script>

<template>
  <div ref="wrapRef" class="doc-import-wrap">
    <button
      ref="triggerRef"
      type="button"
      class="doc-import-trigger"
      :disabled="disabled"
      :aria-disabled="disabled || undefined"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :aria-controls="menuId ?? 'doc-import-menu'"
      :title="disabled ? 'Import unavailable' : 'Import .md or .zip files'"
      :aria-label="disabled ? 'Import Markdown (unavailable)' : 'Import Markdown or ZIP'"
      @click="toggleMenu"
    >
      <svg
        class="doc-import-trigger-icon"
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
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </button>
    <Teleport to="body">
      <ul
        v-show="menuOpen"
        :id="menuId ?? 'doc-import-menu'"
        ref="menuTeleportRef"
        class="doc-import-menu doc-import-menu--floating"
        role="menu"
        :style="menuFixedStyle"
        aria-label="导入 Markdown"
      >
        <li role="none">
          <button type="button" class="doc-import-menu-item" role="menuitem" @click="pickLocalMd">
            从本地选择…（.md / .zip，可多选）
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
    </Teleport>
    <input
      ref="fileInputRef"
      type="file"
      class="doc-import-hidden-file"
      accept=".md,.markdown,.txt,.zip,application/zip,text/markdown,text/plain"
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
}

.doc-import-trigger-icon {
  flex-shrink: 0;
}

.doc-import-trigger:hover:not(:disabled) {
  filter: brightness(0.97);
}

.doc-import-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.doc-import-menu {
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.doc-import-menu--floating {
  position: fixed;
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
  z-index: 100;
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
