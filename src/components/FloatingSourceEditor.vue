<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    title?: string
  }>(),
  { language: 'plaintext', title: '源码编辑' },
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
    theme: 'vs',
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
          <button class="floating-close" type="button" aria-label="关闭" @click="close">✕</button>
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
  background: rgba(15, 18, 28, 0.45);
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
  border-radius: 10px;
  background: var(--surface, #ffffff);
  border: 1px solid var(--border, #e0e0e0);
  overflow: hidden;
}

.floating-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border, #e0e0e0);
  flex-shrink: 0;
}

.floating-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.floating-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--muted, #888);
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.floating-close:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.06));
}

.floating-editor-host {
  flex: 1;
  min-height: 0;
}
</style>
