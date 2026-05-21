<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

const props = defineProps<{
  modelValue: string
  reading?: 'light' | 'dark'
}>()

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
    const vditorEl = host.value?.querySelector('.vditor') as HTMLElement | null
    if (vditorEl) {
      const w = host.value!.clientWidth
      vditorEl.style.width = `${w}px`
      const toolbar = vditorEl.querySelector('.vditor-toolbar') as HTMLElement | null
      if (toolbar) toolbar.style.width = `${w}px`
      const content = vditorEl.querySelector('.vditor-content') as HTMLElement | null
      if (content) content.style.width = `${w}px`
      window.dispatchEvent(new Event('resize'))
    }
  })
  resizeObserver.observe(host.value)

  try {
    vditor = new Vditor(host.value, {
      height: '100%',
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
        vditor?.setTheme(props.reading === 'dark' ? 'dark' : 'classic')
      },
    })
  } catch {
    // Vditor 初始化失败（如 DOM 已不存在）静默处理
  }
})

watch(
  () => props.reading,
  (theme, old) => {
    if (!vditor || !ready || old === undefined) return
    vditor.setTheme(theme === 'dark' ? 'dark' : 'classic')
  },
)

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
  max-width: 100% !important;
}

:deep(.vditor .vditor-content),
:deep(.vditor .vditor-reset) {
  width: 100% !important;
  max-width: 100% !important;
}

:deep(.vditor-toolbar) {
  flex-wrap: wrap;
  width: 100% !important;
}

/* Dark 模式覆盖 */
:deep(.vditor--dark) {
  --vditor-bg: #202020;
  --vditor-text: #e6e6e6;
  color: var(--vditor-text);
}

:deep(.vditor--dark .vditor-reset) {
  color: #e6e6e6;
  background: #202020;
}

:deep(.vditor--dark .vditor-reset h1),
:deep(.vditor--dark .vditor-reset h2),
:deep(.vditor--dark .vditor-reset h3),
:deep(.vditor--dark .vditor-reset h4),
:deep(.vditor--dark .vditor-reset h5),
:deep(.vditor--dark .vditor-reset h6),
:deep(.vditor--dark .vditor-reset p),
:deep(.vditor--dark .vditor-reset li),
:deep(.vditor--dark .vditor-reset span) {
  color: #e6e6e6;
}

:deep(.vditor--dark .vditor-reset a) {
  color: #529cca;
}

:deep(.vditor--dark .vditor-reset table) {
  border-color: rgba(255, 255, 255, 0.1);
}

:deep(.vditor--dark .vditor-reset th),
:deep(.vditor--dark .vditor-reset td) {
  border-color: rgba(255, 255, 255, 0.1);
  color: #e6e6e6;
}

:deep(.vditor--dark .vditor-reset th) {
  background: rgba(255, 255, 255, 0.05);
}

:deep(.vditor--dark .vditor-reset code):not(.hljs) {
  background: rgba(255, 255, 255, 0.08);
  color: #f87171;
}

:deep(.vditor--dark .vditor-reset pre) {
  background: #191919;
}

:deep(.vditor--dark .vditor-reset blockquote) {
  border-left-color: rgba(255, 255, 255, 0.15);
  color: #aaa;
}

:deep(.vditor--dark .vditor-reset hr) {
  border-color: rgba(255, 255, 255, 0.06);
}
</style>
