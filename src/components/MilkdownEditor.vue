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

/* ---- Content styles matching markdown preview ---- */
:deep(.milkdown .ProseMirror h1) {
  margin: 0 0 0.5rem;
  padding-bottom: 0.25rem;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.28;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

:deep(.milkdown .ProseMirror h2) {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.milkdown .ProseMirror h3) {
  margin: 1.25rem 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.milkdown .ProseMirror h4),
:deep(.milkdown .ProseMirror h5),
:deep(.milkdown .ProseMirror h6) {
  margin: 1rem 0 0.35rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.milkdown .ProseMirror h2:first-child),
:deep(.milkdown .ProseMirror h1 + h2) {
  margin-top: 0.25rem;
}

:deep(.milkdown .ProseMirror p) {
  margin: 0 0 0.5rem;
}

:deep(.milkdown .ProseMirror p:last-child) {
  margin-bottom: 0;
}

:deep(.milkdown .ProseMirror blockquote) {
  margin: 0.5rem 0;
  padding: 0.25rem 0 0.25rem 0.8rem;
  border-left: 3px solid rgba(0, 0, 0, 0.1);
  color: #9b9a97;
}

:deep(.milkdown .ProseMirror blockquote p) {
  margin: 0.25rem 0;
}

:deep(.milkdown .ProseMirror hr) {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

:deep(.milkdown .ProseMirror ul),
:deep(.milkdown .ProseMirror ol) {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.35rem;
}

:deep(.milkdown .ProseMirror li) {
  margin: 0.15rem 0;
}

:deep(.milkdown .ProseMirror li > p) {
  margin: 0.25rem 0;
}

:deep(.milkdown .ProseMirror ul ul),
:deep(.milkdown .ProseMirror ol ol),
:deep(.milkdown .ProseMirror ul ol),
:deep(.milkdown .ProseMirror ol ul) {
  margin: 0.2rem 0 0.3rem;
}

:deep(.milkdown .ProseMirror pre) {
  margin: 0.5rem 0;
  background: #f7f6f3;
  padding: 0.75rem 0.85rem;
  border-radius: 4px;
  overflow: auto;
  font-size: 0.8125rem;
  line-height: 1.55;
}

:deep(.milkdown .ProseMirror code) {
  font-family: var(--crepe-font-code);
  font-size: 0.9em;
}

:deep(.milkdown .ProseMirror p code),
:deep(.milkdown .ProseMirror li code),
:deep(.milkdown .ProseMirror td code),
:deep(.milkdown .ProseMirror th code) {
  padding: 0.1em 0.35em;
  border-radius: 3px;
  background: #f7f6f3;
  font-size: 0.88em;
  color: #e5484d;
}

:deep(.milkdown .ProseMirror pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
  color: inherit;
}

:deep(.milkdown .ProseMirror a) {
  color: var(--accent, #0969da);
}

:deep(.milkdown .ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
}

:deep(.milkdown .ProseMirror th),
:deep(.milkdown .ProseMirror td) {
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}

:deep(.milkdown .ProseMirror th) {
  font-weight: 600;
  background: rgba(0, 0, 0, 0.02);
}

:deep(.milkdown .ProseMirror img) {
  max-width: 100%;
  height: auto;
}

/* Hide Crepe's language label on code blocks */
:deep(.milkdown .ProseMirror pre[data-language]::before) {
  display: none;
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

[data-theme="dark"] :deep(.milkdown .ProseMirror h1),
[data-theme="dark"] :deep(.milkdown .ProseMirror h2),
[data-theme="dark"] :deep(.milkdown .ProseMirror h3),
[data-theme="dark"] :deep(.milkdown .ProseMirror h4),
[data-theme="dark"] :deep(.milkdown .ProseMirror h5),
[data-theme="dark"] :deep(.milkdown .ProseMirror h6),
[data-theme="dark"] :deep(.milkdown .ProseMirror p),
[data-theme="dark"] :deep(.milkdown .ProseMirror li),
[data-theme="dark"] :deep(.milkdown .ProseMirror td),
[data-theme="dark"] :deep(.milkdown .ProseMirror th) {
  color: #e6e6e6;
}

[data-theme="dark"] :deep(.milkdown .ProseMirror h1) {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.milkdown .ProseMirror hr) {
  border-top-color: rgba(255, 255, 255, 0.06);
}

[data-theme="dark"] :deep(.milkdown .ProseMirror blockquote) {
  border-left-color: rgba(255, 255, 255, 0.15);
  color: #aaa;
}

[data-theme="dark"] :deep(.milkdown .ProseMirror pre) {
  background: #191919;
}

[data-theme="dark"] :deep(.milkdown .ProseMirror p code),
[data-theme="dark"] :deep(.milkdown .ProseMirror li code),
[data-theme="dark"] :deep(.milkdown .ProseMirror td code),
[data-theme="dark"] :deep(.milkdown .ProseMirror th code) {
  background: rgba(255, 255, 255, 0.08);
  color: #f87171;
}

[data-theme="dark"] :deep(.milkdown .ProseMirror pre code) {
  background: transparent;
  color: inherit;
}

[data-theme="dark"] :deep(.milkdown .ProseMirror table),
[data-theme="dark"] :deep(.milkdown .ProseMirror th),
[data-theme="dark"] :deep(.milkdown .ProseMirror td) {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.milkdown .ProseMirror th) {
  background: rgba(255, 255, 255, 0.05);
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
