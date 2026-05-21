<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

const props = defineProps<{ modelValue: string }>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let vditor: Vditor | null = null
let syncing = false
let ready = false
let initialValue = ''
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  initialValue = props.modelValue

  resizeObserver = new ResizeObserver(() => {
    window.dispatchEvent(new Event('resize'))
  })
  resizeObserver.observe(host.value)

  try {
    vditor = new Vditor(host.value, {
      height: '100%',
      width: '100%',
      mode: 'wysiwyg',
      placeholder: '开始编辑…',
      value: initialValue,
      cache: { id: `md-studio-vditor-${Date.now()}`, enable: false },
      toolbar: [
        'undo', 'redo', '|',
        'headings', 'bold', 'italic', 'strike', '|',
        'line', 'quote', 'list', 'ordered-list', 'check', 'code', 'inline-code', '|',
        'link', 'table', '|',
        'preview', 'fullscreen',
      ],
      toolbarConfig: { pin: true },
      counter: { enable: true },
      outline: { enable: false } as any,
      input(value) {
        if (!ready || syncing) return
        if (value === initialValue) return
        emit('update:modelValue', value)
      },
      after() {
        ready = true
      },
    })
  } catch {
    // Vditor 初始化失败（如 DOM 已不存在）静默处理
  }
})

watch(
  () => props.modelValue,
  (v) => {
    if (!vditor || !ready || syncing) return
    try {
      const cur = vditor.getValue()
      if (v !== cur) {
        syncing = true
        vditor.setValue(v, true)
        syncing = false
      }
    } catch {
      syncing = false
    }
  },
)

onBeforeUnmount(() => {
  ready = false
  resizeObserver?.disconnect()
  resizeObserver = null
  try { vditor?.destroy() } catch { /* ignore */ }
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
  width: 100%;
  overflow: hidden;
}

:deep(.vditor) {
  width: 100% !important;
}

:deep(.vditor-toolbar) {
  flex-wrap: wrap;
}
</style>
