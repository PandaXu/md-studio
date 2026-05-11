<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type MonacoEditorTheme = 'vs' | 'vs-dark'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    /** Monaco 主题：深色用 `vs-dark` */
    editorTheme?: MonacoEditorTheme
  }>(),
  { language: 'plaintext', editorTheme: 'vs' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

type ITextModelWithSetLanguage = monaco.editor.ITextModel & {
  setLanguageId(languageId: string): void
}

onMounted(() => {
  if (!host.value) return
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

watch(
  () => props.editorTheme,
  (t) => {
    if (!editor) return
    monaco.editor.setTheme(t)
  },
)

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})

defineExpose({
  /** 获取 Monaco 编辑器实例，用于滚动同步等高级操作 */
  getEditor() {
    return editor
  },
})
</script>

<template>
  <div ref="host" class="editor-host" />
</template>

<style scoped>
.editor-host {
  height: 100%;
  min-height: 200px;
}
</style>
