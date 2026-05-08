<script setup lang="ts">
import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'
import mermaid from 'mermaid'
import { mermaidInitForTheme, type MermaidThemeId } from '@/themes'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    chartTheme: MermaidThemeId
    /** 与全站阅读模式同步：深色时使用 Toast UI dark 主题 */
    reading?: 'light' | 'dark'
  }>(),
  { reading: 'light' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLElement | null>(null)
let editor: any = null
let syncingFromParent = false
let renderTimer: ReturnType<typeof setTimeout> | null = null

function normalizeMermaidCode(source: string): string {
  const cleaned = source.replace(/\r\n/g, '\n').replace(/\s+$/, '')
  return `${cleaned}\n`
}

function replaceMermaidBlockAt(markdown: string, blockIndex: number, newCode: string): string {
  let hit = -1
  return markdown.replace(/```mermaid[^\n]*\n([\s\S]*?)```/g, (full) => {
    hit += 1
    if (hit !== blockIndex) return full
    return `\`\`\`mermaid\n${normalizeMermaidCode(newCode)}\`\`\``
  })
}

function mermaidOpts() {
  return {
    enterprisePreview: props.reading === 'dark' ? ('dark' as const) : ('light' as const),
  }
}

async function renderMermaidSvg(container: HTMLElement, errEl: HTMLElement, code: string): Promise<void> {
  container.innerHTML = ''
  errEl.textContent = ''
  const trimmed = code.trim()
  if (!trimmed) return
  try {
    mermaid.initialize(mermaidInitForTheme(props.chartTheme, mermaidOpts()))
    await mermaid.parse(trimmed)
    const id = `mmd-tui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { svg } = await mermaid.render(id, trimmed)
    container.innerHTML = svg
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : String(e)
  }
}

function getMermaidCodeBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        'pre code.language-mermaid',
        'pre code[class*="language-mermaid"]',
        'pre[data-language="mermaid"] code',
      ].join(','),
    ),
  )
}

function queueDecorateMermaidBlocks() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    void decorateMermaidBlocks()
  }, 120)
}

async function decorateMermaidBlocks() {
  if (!host.value) return
  host.value.querySelectorAll('.tui-mermaid-panel').forEach((n) => n.remove())

  const codeNodes = getMermaidCodeBlocks(host.value)
  for (let idx = 0; idx < codeNodes.length; idx += 1) {
    const codeNode = codeNodes[idx]
    const pre = codeNode.closest('pre')
    if (!pre || !pre.parentElement) continue
    const source = codeNode.textContent ?? ''

    const panel = document.createElement('div')
    panel.className = 'tui-mermaid-panel'

    const details = document.createElement('details')
    details.className = 'tui-mermaid-details'

    const summary = document.createElement('summary')
    summary.className = 'tui-mermaid-summary'
    summary.textContent = 'Mermaid 源码（点击展开 / 收起）'
    details.appendChild(summary)

    const textarea = document.createElement('textarea')
    textarea.className = 'tui-mermaid-textarea'
    textarea.value = source.trimEnd()
    textarea.setAttribute('aria-label', 'Mermaid 源码编辑')
    const previewTitle = document.createElement('div')
    previewTitle.className = 'tui-mermaid-preview-title'
    previewTitle.textContent = 'SVG 预览'
    const out = document.createElement('div')
    out.className = 'tui-mermaid-out'
    const errEl = document.createElement('div')
    errEl.className = 'tui-mermaid-error'
    errEl.setAttribute('role', 'alert')

    textarea.addEventListener('input', () => {
      if (!editor) return
      const current = editor.getMarkdown()
      const next = replaceMermaidBlockAt(current, idx, textarea.value)
      if (next !== current) emit('update:modelValue', next)
      void renderMermaidSvg(out, errEl, textarea.value)
    })
    details.appendChild(textarea)

    panel.appendChild(details)
    panel.appendChild(previewTitle)
    panel.appendChild(out)
    panel.appendChild(errEl)
    pre.insertAdjacentElement('afterend', panel)
    await renderMermaidSvg(out, errEl, source)
  }
}

function toastTheme(): 'dark' | 'default' {
  return props.reading === 'dark' ? 'dark' : 'default'
}

function wireChangeHandler() {
  if (!editor) return
  editor.on('change', () => {
    if (!editor || syncingFromParent) return
    emit('update:modelValue', editor.getMarkdown())
    queueDecorateMermaidBlocks()
  })
}

function mountToastEditor(initialMarkdown: string) {
  if (!host.value) return
  editor = new Editor({
    el: host.value,
    initialValue: initialMarkdown,
    initialEditType: 'wysiwyg',
    previewStyle: 'vertical',
    hideModeSwitch: true,
    height: '100%',
    theme: toastTheme(),
  })
  wireChangeHandler()
  queueDecorateMermaidBlocks()
}

onMounted(() => {
  mountToastEditor(props.modelValue)
})

watch(
  () => props.modelValue,
  (next) => {
    if (!editor) return
    const current = editor.getMarkdown()
    if (next === current) return
    syncingFromParent = true
    editor.setMarkdown(next, false)
    syncingFromParent = false
    queueDecorateMermaidBlocks()
  },
)

watch(
  () => props.chartTheme,
  () => {
    queueDecorateMermaidBlocks()
  },
)

watch(
  () => props.reading,
  async () => {
    if (!host.value) return
    const md = editor?.getMarkdown() ?? props.modelValue
    editor?.destroy()
    editor = null
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
    mountToastEditor(md)
  },
)

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer)
  editor?.destroy()
  editor = null
})
</script>

<template>
  <div class="tui-editor-wrap">
    <div ref="host" class="tui-editor-host" />
  </div>
</template>

<style scoped>
.tui-editor-wrap,
.tui-editor-host {
  height: 100%;
  min-height: 240px;
}

:deep(.tui-mermaid-panel) {
  margin: 0.5rem 0 1rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--surface, #fff);
  overflow: hidden;
}

:deep(.tui-mermaid-details) {
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--bg, #f9fafb);
}

:deep(.tui-mermaid-summary) {
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  color: var(--muted, #5c6578);
}

:deep(.tui-mermaid-textarea) {
  display: block;
  width: calc(100% - 1rem);
  margin: 0 0.5rem 0.5rem;
  min-height: 6rem;
  font: 0.8125rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  resize: vertical;
}

:deep(.tui-mermaid-out) {
  padding: 0.35rem 0.6rem 0.35rem;
  overflow: auto;
}

:deep(.tui-mermaid-out svg) {
  max-width: 100%;
  height: auto;
}

:deep(.tui-mermaid-error) {
  padding: 0 0.6rem 0.55rem;
  font-size: 0.8rem;
  color: var(--error-text, #991b1b);
  white-space: pre-wrap;
}

:deep(.tui-mermaid-preview-title) {
  padding: 0.5rem 0.6rem 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted, #5c6578);
}
</style>
