<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'
import { createMermaidPlugin, resetMermaidTheme } from '@/markdown/milkdownMermaid'
import '@/styles/milkdown/crepe.css'

const props = defineProps<{
  modelValue: string
  reading?: 'light' | 'dark'
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let crepe: Crepe | null = null
let syncing = false
let ready = false

onMounted(async () => {
  if (!host.value) return

  try {
    crepe = new Crepe({
      root: host.value,
      defaultValue: props.modelValue,
      features: {
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.AI]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.CodeMirror]: false,
      },
    })

    crepe.editor.use(createMermaidPlugin(props.reading === 'dark' ? 'dark' : 'light'))

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (!ready || syncing) return
        emit('update:modelValue', markdown)
      })
    })

    await crepe.create()
    ready = true
  } catch {
    // init failure silently handled
  }
})

watch(
  () => props.modelValue,
  (v) => {
    if (!crepe || !ready || syncing) return
    try {
      const cur = crepe.getMarkdown()
      if (v !== cur) {
        syncing = true
        crepe.editor.action(replaceAll(v))
        syncing = false
      }
    } catch {
      syncing = false
    }
  },
)

watch(
  () => props.reading,
  (theme) => {
    resetMermaidTheme(theme === 'dark' ? 'dark' : 'light')
  },
)

onBeforeUnmount(() => {
  ready = false
  try { crepe?.destroy() } catch { /* ignore */ }
  crepe = null
})
</script>

<template>
  <div
    ref="host"
    class="milkdown-editor-host"
    :data-theme="reading ?? 'light'"
  />
</template>

<style scoped>
.milkdown-editor-host {
  height: 100%;
  min-height: 240px;
  width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

:deep(.milkdown) {
  min-height: 240px;
  --crepe-font-default: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  --crepe-font-code: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;

  font-family: var(--crepe-font-default);
  font-size: 14px;
  line-height: 1.7;
  color: #37352f;
  background: #fff;
}

:deep(.milkdown .ProseMirror) {
  outline: none;
  padding: 0.5rem 1rem;
}

/* ---- Mermaid widget ---- */
:deep(.milkdown-mermaid-widget) {
  margin: 0.5rem 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  overflow: hidden;
  display: block;
  clear: both;
}

:deep(.mermaid-tb) {
  padding: 0.2rem 0.5rem;
  background: #f0f0f0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 0.7rem;
  font-weight: 600;
  color: #7b7b7b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

:deep(.mermaid-pv) {
  padding: 0.5rem;
  display: flex;
  justify-content: center;
  background: #fcfcfc;
}

:deep(.mermaid-pv svg) {
  max-width: 100%;
  height: auto;
}

:deep(.mermaid-pv-empty),
:deep(.mermaid-pv-err) {
  font-size: 0.8125rem;
  padding: 0.5rem;
}

:deep(.mermaid-pv-empty) { color: #9b9a97; }
:deep(.mermaid-pv-err) {
  color: #e5484d;
  font-family: var(--crepe-font-code);
}

/* Dark theme */
[data-theme="dark"] :deep(.milkdown) {
  --crepe-color-background: #202020;
  --crepe-color-on-background: #e6e6e6;
  --crepe-color-surface: #191919;
  --crepe-color-surface-low: #252525;
  --crepe-color-on-surface: #e6e6e6;
  --crepe-color-on-surface-variant: #9b9b9b;
  --crepe-color-outline: rgba(255, 255, 255, 0.1);
  --crepe-color-primary: #529cca;
  --crepe-color-secondary: #333;
  --crepe-color-inline-code: #f87171;
  --crepe-color-error: #f87171;
  --crepe-color-hover: rgba(255, 255, 255, 0.04);
  --crepe-color-selected: rgba(255, 255, 255, 0.08);
  --crepe-color-inline-area: #191919;

  color: #e6e6e6;
  background: #202020;
}

[data-theme="dark"] :deep(.milkdown-mermaid-widget) {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.mermaid-tb) {
  background: #252525;
  border-bottom-color: rgba(255, 255, 255, 0.06);
  color: #9b9b9b;
}

[data-theme="dark"] :deep(.mermaid-pv) {
  background: #1a1a1a;
}

[data-theme="dark"] :deep(.mermaid-pv-err) {
  color: #f87171;
}
</style>
