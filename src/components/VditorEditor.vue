<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLElement | null>(null)
let vditor: Vditor | null = null
let syncing = false

onMounted(() => {
  if (!host.value) return
  vditor = new Vditor(host.value, {
    height: '100%',
    mode: 'wysiwyg',
    placeholder: '开始编辑…',
    value: props.modelValue,
    cache: { id: 'md-studio-vditor', enable: false },
    toolbar: [
      'undo', 'redo', '|',
      'headings', 'bold', 'italic', 'strikethrough', '|',
      'line', 'quote', 'list', 'ordered-list', 'check', 'code', 'inline-code', '|',
      'link', 'table', '|',
      'outline', 'preview', 'fullscreen',
    ],
    toolbarConfig: { pin: true },
    counter: { enable: true },
    outline: { enable: false } as any,
    input(value) {
      if (syncing) return
      emit('update:modelValue', value)
    },
    after() {
      // 编辑器就绪
    },
  })
})

watch(
  () => props.modelValue,
  (v) => {
    if (!vditor || syncing) return
    if (v !== vditor.getValue()) {
      syncing = true
      vditor.setValue(v)
      syncing = false
    }
  },
)

onBeforeUnmount(() => {
  vditor?.destroy()
  vditor = null
})
</script>

<template>
  <div ref="host" class="vditor-editor-host" />
</template>

<style scoped>
.vditor-editor-host {
  height: 100%;
  min-height: 240px;
}
</style>
