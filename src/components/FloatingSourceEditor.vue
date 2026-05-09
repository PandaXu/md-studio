<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    title?: string
    /** Monaco 主题，与 SourceEditor 一致 */
    editorTheme?: 'vs' | 'vs-dark'
  }>(),
  { language: 'plaintext', title: '源码编辑', editorTheme: 'vs' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const visible = ref(false)
const host = ref<HTMLElement | null>(null)
const pendingLine = ref<number | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

function createEditor() {
  if (!host.value || editor) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.editorTheme,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
  })
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue())
  })
}

function disposeEditor() {
  editor?.dispose()
  editor = null
}

function open(lineNumber?: number) {
  pendingLine.value = lineNumber ?? null
  visible.value = true
}

function close() {
  visible.value = false
}

function toggle() {
  visible.value = !visible.value
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
}

watch(visible, async (v) => {
  if (v) {
    await nextTick()
    createEditor()
    if (pendingLine.value !== null && editor) {
      const line = pendingLine.value
      editor.revealLine(line)
      editor.setPosition({ lineNumber: line, column: 1 })
      editor.focus()
      pendingLine.value = null
    }
    document.addEventListener('keydown', onEsc)
  } else {
    disposeEditor()
    document.removeEventListener('keydown', onEsc)
  }
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor) return
    const cur = editor.getValue()
    if (v !== cur) {
      const pos = editor.getPosition()
      editor.setValue(v)
      if (pos) editor.setPosition(pos)
    }
  },
)

watch(
  () => props.language,
  (lang) => {
    if (!editor) return
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, lang)
  },
)

watch(
  () => props.editorTheme,
  (t) => {
    if (!editor) return
    monaco.editor.setTheme(t)
  },
)

onBeforeUnmount(() => {
  disposeEditor()
  document.removeEventListener('keydown', onEsc)
})

defineExpose({ open, close, toggle })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="floating-overlay" @click.self="close">
      <div class="floating-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <header class="floating-header">
          <h3 class="floating-title">{{ title }}</h3>
          <button
            class="floating-close"
            type="button"
            title="关闭浮动编辑器（Esc）"
            aria-label="关闭"
            @click="close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div ref="host" class="floating-editor-host" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.floating-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: grid;
  place-items: center;
  z-index: 51;
}

.floating-dialog {
  display: flex;
  flex-direction: column;
  width: 80vw;
  height: 75vh;
  max-width: 960px;
  max-height: 720px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.floating-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: transparent;
}

.floating-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.floating-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px;
  border-radius: 3px;
  line-height: 0;
}

.floating-close:hover {
  background: var(--doc-panel-hover);
  color: var(--text);
}

.floating-editor-host {
  flex: 1;
  min-height: 0;
}
</style>
