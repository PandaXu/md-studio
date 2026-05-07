<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { onBeforeUnmount, ref, watch } from 'vue'

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
let editor: monaco.editor.IStandaloneCodeEditor | null = null

type ITextModelWithSetLanguage = monaco.editor.ITextModel & {
  setLanguageId(languageId: string): void
}

function createEditor() {
  if (!host.value) return
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

function open() {
  visible.value = true
}

function close() {
  visible.value = false
}

function toggle() {
  visible.value = !visible.value
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
}

watch(visible, (v) => {
  if (v) {
    // Wait for next tick so the DOM ref is available
    requestAnimationFrame(() => createEditor())
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
    ;(editor.getModel() as ITextModelWithSetLanguage | null)?.setLanguageId(lang)
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
    <div v-if="visible" class="floating-overlay" @click="onBackdropClick">
      <div class="floating-dialog">
        <div class="floating-header">
          <span class="floating-title">{{ title }}</span>
          <button class="floating-close" @click="close">✕</button>
        </div>
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
  background: var(--tk-surface-bg, #ffffff);
  border: 1px solid var(--tk-border, #e0e0e0);
  overflow: hidden;
}

.floating-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--tk-border, #e0e0e0);
  flex-shrink: 0;
}

.floating-title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.floating-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--tk-muted, #888);
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.floating-close:hover {
  background: var(--tk-hover-bg, rgba(0, 0, 0, 0.06));
}

.floating-editor-host {
  flex: 1;
  min-height: 0;
}
</style>
