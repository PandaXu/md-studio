<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { replaceAll, getMarkdown } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/vue'
import mermaid from 'mermaid'
import { mermaidInitForTheme, type MermaidThemeId } from '@/themes'

const props = withDefaults(
  defineProps<{
    modelValue: string
    chartTheme: MermaidThemeId
    reading?: 'light' | 'dark'
  }>(),
  { reading: 'light' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// --- Mermaid 渲染 ---

function normalizeMermaidCode(source: string): string {
  return `${source.replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`
}

function replaceMermaidBlockAt(md: string, idx: number, code: string): string {
  let hit = -1
  return md.replace(/```mermaid[^\n]*\n([\s\S]*?)```/g, (full) => {
    hit += 1
    return hit !== idx ? full : `\`\`\`mermaid\n${normalizeMermaidCode(code)}\`\`\``
  })
}

async function renderSvg(container: HTMLElement, errEl: HTMLElement, code: string) {
  container.innerHTML = ''
  errEl.textContent = ''
  const t = code.trim()
  if (!t) return
  try {
    mermaid.initialize(mermaidInitForTheme(props.chartTheme, {
      enterprisePreview: props.reading === 'dark' ? 'dark' : 'light',
    }))
    await mermaid.parse(t)
    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { svg } = await mermaid.render(id, t)
    container.innerHTML = svg
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : String(e)
  }
}

function findCodeBlocks(root: HTMLElement): { pre: HTMLElement; source: string }[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'pre[data-language="mermaid"], .ProseMirror pre[data-language="mermaid"], pre code.language-mermaid',
  ))
    .map((el) => {
      const pre = el.tagName === 'PRE' ? el : (el.closest('pre') as HTMLElement)
      return pre ? { pre, source: (pre.textContent ?? '').trimEnd() } : null
    })
    .filter(Boolean) as { pre: HTMLElement; source: string }[]
}

function decorateMermaidBlocks() {
  const root = document.querySelector('.milkdown-editor-wrap .editor') as HTMLElement | null
  if (!root) return
  root.querySelectorAll('.mermaid-preview-panel').forEach((n) => n.remove())

  findCodeBlocks(root).forEach(({ pre, source }, blockIdx) => {
    if (!source) return

    const panel = document.createElement('div')
    panel.className = 'mermaid-preview-panel'

    const out = document.createElement('div')
    out.className = 'mermaid-preview-out'
    const errEl = document.createElement('div')
    errEl.className = 'mermaid-preview-error'
    errEl.setAttribute('role', 'alert')

    const toggle = document.createElement('button')
    toggle.className = 'mermaid-preview-toggle'
    toggle.textContent = 'Mermaid 预览 ▼'
    toggle.addEventListener('click', () => {
      const hidden = panel.classList.toggle('collapsed')
      toggle.textContent = hidden ? 'Mermaid 预览 ▶' : 'Mermaid 预览 ▼'
    })

    panel.append(toggle, out, errEl)
    pre.insertAdjacentElement('afterend', panel)
    void renderSvg(out, errEl, source)

    out.addEventListener('dblclick', () => {
      const textarea = document.createElement('textarea')
      textarea.className = 'mermaid-preview-textarea'
      textarea.value = source
      textarea.addEventListener('input', () => { void renderSvg(out, errEl, textarea.value) })
      textarea.addEventListener('blur', () => {
        const md = editorCtx!.action(getMarkdown())
        const next = replaceMermaidBlockAt(md, blockIdx, textarea.value)
        if (next !== md) emit('update:modelValue', next)
        textarea.remove()
      })
      textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') textarea.blur() })
      panel.appendChild(textarea)
      textarea.focus()
    })
  })
}

let editorCtx: ReturnType<ReturnType<typeof useEditor>['get']> = undefined as any
let decorateTimer: ReturnType<typeof setTimeout> | null = null

function queueDecorate() {
  if (decorateTimer) clearTimeout(decorateTimer)
  decorateTimer = setTimeout(() => { decorateTimer = null; decorateMermaidBlocks() }, 200)
}

// --- Milkdown 编辑器 ---

const { get: getEditor, loading } = useEditor((root) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.modelValue)
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        emit('update:modelValue', markdown)
        queueDecorate()
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
})

onMounted(() => {
  const editor = getEditor()
  if (editor) {
    editorCtx = editor
    queueDecorate()
  }
})

// 外部更新 modelValue 时同步编辑器
watch(() => props.modelValue, (v) => {
  const editor = editorCtx
  if (!editor || loading.value) return
  const current = editor.action(getMarkdown())
  if (v !== current) {
    editor.action(replaceAll(v))
    queueDecorate()
  }
})

watch(() => props.chartTheme, () => queueDecorate())
watch(() => props.reading, () => queueDecorate())

onBeforeUnmount(() => {
  if (decorateTimer) clearTimeout(decorateTimer)
})
</script>

<template>
  <div class="milkdown-editor-wrap">
    <MilkdownProvider>
      <Milkdown />
    </MilkdownProvider>
  </div>
</template>

<style>
.milkdown-editor-wrap {
  height: 100%;
  min-height: 240px;
  overflow: auto;
}

.milkdown-editor-wrap .milkdown {
  min-height: 240px;
  padding: 0 0.5rem;
}

/* Mermaid 预览面板 */
.mermaid-preview-panel {
  margin: 0.5rem 0 1rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--surface, #fff);
  overflow: hidden;
}

.mermaid-preview-panel.collapsed .mermaid-preview-out,
.mermaid-preview-panel.collapsed .mermaid-preview-error {
  display: none;
}

.mermaid-preview-toggle {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.4rem 0.6rem;
  border: none;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--bg, #f9fafb);
  color: var(--muted, #5c6578);
  cursor: pointer;
}

.mermaid-preview-out {
  padding: 0.35rem 0.6rem;
  overflow: auto;
}

.mermaid-preview-out svg {
  max-width: 100%;
  height: auto;
}

.mermaid-preview-error {
  padding: 0 0.6rem 0.55rem;
  font-size: 0.8rem;
  color: var(--error-text, #991b1b);
  white-space: pre-wrap;
}

.mermaid-preview-textarea {
  display: block;
  width: calc(100% - 1rem);
  margin: 0.5rem;
  min-height: 6rem;
  font: 0.8125rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  resize: vertical;
}

[data-reading='dark'] .mermaid-preview-panel {
  background: #202020;
  border-color: rgba(255, 255, 255, 0.06);
}

[data-reading='dark'] .mermaid-preview-toggle {
  background: #191919;
}
</style>
