<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { replaceAll, getMarkdown } from '@milkdown/kit/utils'
import { createMermaidPlugin, resetMermaidTheme } from '@/markdown/milkdownMermaid'
import '@milkdown/kit/prose/view/style/prosemirror.css'

const props = defineProps<{
  modelValue: string
  reading?: 'light' | 'dark'
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let editor: Editor | null = null
let syncing = false
let ready = false

function mermaidTone() {
  return props.reading === 'dark' ? 'dark' as const : 'light' as const
}

onMounted(async () => {
  if (!host.value) return

  try {
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.value!)
        ctx.set(defaultValueCtx, props.modelValue)
      })
      .use(createMermaidPlugin(mermaidTone()))
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(trailing)
      .use(listener)
      .use(clipboard)
      .config((ctx) => {
        const mgr = ctx.get(listenerCtx)
        mgr.markdownUpdated((_ctx, markdown) => {
          if (!ready || syncing) return
          emit('update:modelValue', markdown)
        })
      })
      .create()

    ready = true
  } catch {
    // Milkdown init failure silently handled
  }
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editor || !ready || syncing) return
    try {
      const cur = editor.action(getMarkdown())
      if (v !== cur) {
        syncing = true
        editor.action(replaceAll(v))
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
  try { editor?.destroy() } catch { /* ignore */ }
  editor = null
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

:deep(.ProseMirror) {
  min-height: 240px;
  padding: 0.5rem 1rem;
  outline: none;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: #37352f;
}

:deep(.ProseMirror p) {
  margin: 0 0 0.5rem;
}

:deep(.ProseMirror h1) {
  margin: 0 0 0.5rem;
  padding-bottom: 0.25rem;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.28;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

:deep(.ProseMirror h2) {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.ProseMirror h3) {
  margin: 1.25rem 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.ProseMirror h4),
:deep(.ProseMirror h5),
:deep(.ProseMirror h6) {
  margin: 1rem 0 0.35rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.28;
}

:deep(.ProseMirror blockquote) {
  margin: 0.5rem 0;
  padding: 0.25rem 0 0.25rem 0.8rem;
  border-left: 3px solid rgba(0, 0, 0, 0.1);
  color: #9b9a97;
}

:deep(.ProseMirror blockquote p) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror hr) {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.35rem;
}

:deep(.ProseMirror li) {
  margin: 0.15rem 0;
  padding-left: 0.1rem;
}

:deep(.ProseMirror li > p) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror pre) {
  margin: 0.5rem 0;
  background: #f7f6f3;
  padding: 0.75rem 0.85rem;
  border-radius: 4px;
  overflow: auto;
  font-size: 0.8125rem;
  line-height: 1.55;
}

:deep(.ProseMirror code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

:deep(.ProseMirror p code),
:deep(.ProseMirror li code) {
  padding: 0.1em 0.35em;
  border-radius: 3px;
  background: #f7f6f3;
  font-size: 0.88em;
  color: #e5484d;
}

:deep(.ProseMirror pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
  color: inherit;
}

:deep(.ProseMirror a) {
  color: var(--accent, #0969da);
}

:deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
}

:deep(.ProseMirror th),
:deep(.ProseMirror td) {
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}

:deep(.ProseMirror th) {
  font-weight: 600;
}

:deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
}

/* ---- Mermaid widget (inside editor, managed by ProseMirror decoration) ---- */
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

:deep(.mermaid-pv-empty) {
  color: #9b9a97;
  font-size: 0.8125rem;
  padding: 0.5rem;
}

:deep(.mermaid-pv-err) {
  color: #e5484d;
  font-size: 0.8125rem;
  padding: 0.5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Dark theme */
[data-theme="dark"] :deep(.ProseMirror) {
  color: #e6e6e6;
}

[data-theme="dark"] :deep(.ProseMirror h1),
[data-theme="dark"] :deep(.ProseMirror h2),
[data-theme="dark"] :deep(.ProseMirror h3),
[data-theme="dark"] :deep(.ProseMirror h4),
[data-theme="dark"] :deep(.ProseMirror h5),
[data-theme="dark"] :deep(.ProseMirror h6),
[data-theme="dark"] :deep(.ProseMirror p),
[data-theme="dark"] :deep(.ProseMirror li),
[data-theme="dark"] :deep(.ProseMirror span),
[data-theme="dark"] :deep(.ProseMirror th),
[data-theme="dark"] :deep(.ProseMirror td) {
  color: #e6e6e6;
}

[data-theme="dark"] :deep(.ProseMirror a) {
  color: #529cca;
}

[data-theme="dark"] :deep(.ProseMirror h1) {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.ProseMirror hr) {
  border-top-color: rgba(255, 255, 255, 0.06);
}

[data-theme="dark"] :deep(.ProseMirror blockquote) {
  border-left-color: rgba(255, 255, 255, 0.15);
  color: #aaa;
}

[data-theme="dark"] :deep(.ProseMirror pre) {
  background: #191919;
}

[data-theme="dark"] :deep(.ProseMirror code) {
  color: inherit;
}

[data-theme="dark"] :deep(.ProseMirror p code),
[data-theme="dark"] :deep(.ProseMirror li code) {
  background: rgba(255, 255, 255, 0.08);
  color: #f87171;
}

[data-theme="dark"] :deep(.ProseMirror pre code) {
  background: transparent;
  color: inherit;
}

[data-theme="dark"] :deep(.ProseMirror table) {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.ProseMirror th),
[data-theme="dark"] :deep(.ProseMirror td) {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme="dark"] :deep(.ProseMirror th) {
  background: rgba(255, 255, 255, 0.05);
}

/* Mermaid dark */
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
