<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: 'plaintext',
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

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
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
