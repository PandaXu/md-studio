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
    } catch {
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
