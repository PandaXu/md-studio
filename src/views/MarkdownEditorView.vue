<script setup lang="ts">
import '@/styles/editor-shell.css'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import SourceEditor from '@/components/SourceEditor.vue'
import { renderMermaidBlocksIn } from '@/markdown/mermaidBlocks'
import { renderMarkdownToHtml } from '@/markdown/render'
import { sanitizeMarkdownHtml } from '@/markdown/sanitize'
import { MERMAID_THEMES, type MermaidThemeId } from '@/themes'

type LayoutMode = 'split' | 'code' | 'preview'
type ReadingMode = 'light' | 'dark'

const SOURCE_KEY = 'markdown-editor-source'
const LAYOUT_KEY = 'markdown-editor-layout'
const READING_KEY = 'markdown-editor-reading'
const CHART_THEME_KEY = 'markdown-editor-mermaid-theme'

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'split', label: '左右并列' },
  { value: 'code', label: '仅 Markdown 源码' },
  { value: 'preview', label: '仅预览' },
]

const DEFAULT_SAMPLE = `# Markdown 示例

GFM 表格与任务列表：

| 步骤 | 说明 |
|------|------|
| 编辑 | 左侧修改源码 |
| 预览 | 右侧实时预览 |

- [x] 支持 **Markdown** 与 Mermaid
- [ ] 自行编辑本文

### Mermaid 图

\`\`\`mermaid
flowchart LR
  A[开始] --> B[结束]
\`\`\`
`

function loadStoredSource(): string | null {
  try {
    const v = localStorage.getItem(SOURCE_KEY)
    return v != null ? v : null
  } catch {
    return null
  }
}

function persistSource(s: string) {
  try {
    localStorage.setItem(SOURCE_KEY, s)
  } catch {
    /* ignore */
  }
}

function loadStoredLayout(): LayoutMode {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    if (v === 'split' || v === 'code' || v === 'preview') return v
  } catch {
    /* ignore */
  }
  return 'split'
}

function persistLayout(mode: LayoutMode) {
  try {
    localStorage.setItem(LAYOUT_KEY, mode)
  } catch {
    /* ignore */
  }
}

function loadStoredReading(): ReadingMode {
  try {
    const v = localStorage.getItem(READING_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

function persistReading(mode: ReadingMode) {
  try {
    localStorage.setItem(READING_KEY, mode)
  } catch {
    /* ignore */
  }
}

function loadStoredChartTheme(): MermaidThemeId {
  try {
    const v = localStorage.getItem(CHART_THEME_KEY)
    if (v === 'default' || v === 'dark' || v === 'forest' || v === 'enterprise') return v
  } catch {
    /* ignore */
  }
  return 'default'
}

function persistChartTheme(id: MermaidThemeId) {
  try {
    localStorage.setItem(CHART_THEME_KEY, id)
  } catch {
    /* ignore */
  }
}

const source = ref(loadStoredSource() ?? DEFAULT_SAMPLE)
const debouncedSource = ref(source.value)
const layout = ref<LayoutMode>(loadStoredLayout())
const reading = ref<ReadingMode>(loadStoredReading())
const chartTheme = ref<MermaidThemeId>(loadStoredChartTheme())
const previewHost = ref<HTMLElement | null>(null)

const topError = ref<string | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pipelineSeq = 0

function debounceSourceUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    debouncedSource.value = source.value
  }, 320)
}

watch(source, debounceSourceUpdate, { flush: 'post' })

const readingLabel = computed(() => (reading.value === 'light' ? '浅色' : '深色'))

const activeChartThemeLabel = computed(
  () => MERMAID_THEMES.find((t) => t.id === chartTheme.value)?.label ?? chartTheme.value,
)

const previewWrapClass = computed(() =>
  reading.value === 'light' ? 'reading-light' : 'reading-dark',
)

function setChartTheme(next: MermaidThemeId) {
  chartTheme.value = next
  persistChartTheme(next)
}

function setReading(next: ReadingMode) {
  reading.value = next
  persistReading(next)
}

async function runMarkdownPipeline() {
  const seq = ++pipelineSeq
  let raw: string
  try {
    raw = renderMarkdownToHtml(debouncedSource.value)
  } catch (e) {
    if (seq !== pipelineSeq) return
    const msg = e instanceof Error ? e.message : String(e)
    topError.value = msg
    return
  }

  let clean: string
  try {
    clean = sanitizeMarkdownHtml(raw)
  } catch (e) {
    if (seq !== pipelineSeq) return
    const msg = e instanceof Error ? e.message : String(e)
    topError.value = msg
    return
  }

  if (seq !== pipelineSeq) return
  topError.value = null
  const host = previewHost.value
  if (!host) return
  host.innerHTML = clean
  persistSource(debouncedSource.value)

  await nextTick()
  if (seq !== pipelineSeq) return
  await renderMermaidBlocksIn(host, chartTheme.value, seq, () => pipelineSeq)
}

watch(debouncedSource, runMarkdownPipeline, { flush: 'post' })
watch(chartTheme, () => {
  void runMarkdownPipeline()
})

watch(layout, (mode) => {
  persistLayout(mode)
  void nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})

onMounted(() => {
  debouncedSource.value = source.value
  void runMarkdownPipeline()
})

function loadSample() {
  source.value = DEFAULT_SAMPLE
  debouncedSource.value = DEFAULT_SAMPLE
}

function exportMd() {
  const blob = new Blob([source.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markdown-${Date.now()}.md`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const EXPORT_CSS_LIGHT = `
body{margin:0;padding:1.25rem;font-family:system-ui,-apple-system,sans-serif;background:#f4f5f7;color:#1a1d24;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid #d8dce3;padding:0.35rem 0.5rem;}
.md-export pre{background:#f4f5f7;padding:0.75rem;border-radius:6px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#991b1b;font-size:0.875rem;}
`

const EXPORT_CSS_DARK = `
body{margin:0;padding:1.25rem;font-family:system-ui,-apple-system,sans-serif;background:#111827;color:#e5e7eb;}
.md-export{max-width:52rem;margin:0 auto;}
.md-export table{border-collapse:collapse;width:100%;margin:0.75rem 0;}
.md-export th,.md-export td{border:1px solid #374151;padding:0.35rem 0.5rem;}
.md-export pre{background:#1f2937;padding:0.75rem;border-radius:6px;overflow:auto;}
.md-export code{font-size:0.9em;}
.md-export .mermaid-block{margin:1rem 0;}
.md-export .mermaid-error{color:#fca5a5;font-size:0.875rem;}
`

function exportHtml() {
  const host = previewHost.value
  if (!host) {
    window.alert('预览区未就绪。')
    return
  }

  const clone = host.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.mermaid-block').forEach((block) => {
    const out = block.querySelector('.mermaid-out')
    const svg = out?.querySelector('svg')
    if (svg) {
      const ser = new XMLSerializer().serializeToString(svg.cloneNode(true) as SVGSVGElement)
      if (out) out.innerHTML = ser
    } else if (out) {
      out.innerHTML = '<p>图表未渲染成功</p>'
    }
    block.querySelector('.mermaid-error')?.remove()
    block.querySelector('pre.mermaid-source')?.remove()
  })

  const style = reading.value === 'dark' ? EXPORT_CSS_DARK : EXPORT_CSS_LIGHT
  const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Markdown 导出</title>
<style>${style}</style>
</head>
<body>
<div class="md-export">${clone.innerHTML}</div>
</body>
</html>`

  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markdown-${Date.now()}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="editor-page">
    <header class="toolbar">
      <h1 class="title">Markdown 编辑与预览</h1>
      <div class="theme-group" role="group" aria-label="阅读模式">
        <span class="theme-label">正文</span>
        <button
          type="button"
          class="theme-btn"
          :class="{ active: reading === 'light' }"
          :aria-pressed="reading === 'light'"
          @click="setReading('light')"
        >
          浅色
        </button>
        <button
          type="button"
          class="theme-btn"
          :class="{ active: reading === 'dark' }"
          :aria-pressed="reading === 'dark'"
          @click="setReading('dark')"
        >
          深色
        </button>
      </div>
      <div class="theme-group" role="group" aria-label="图表主题">
        <span class="theme-label">图表主题</span>
        <button
          v-for="t in MERMAID_THEMES"
          :key="t.id"
          type="button"
          class="theme-btn"
          :class="{ active: chartTheme === t.id }"
          :aria-pressed="chartTheme === t.id"
          :title="t.label"
          @click="setChartTheme(t.id)"
        >
          {{ t.id }}
        </button>
      </div>
      <div class="toolbar-actions">
        <label class="field-inline">
          <span class="field-label">视图布局</span>
          <select v-model="layout" class="select" aria-label="视图布局">
            <option v-for="o in LAYOUT_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <button type="button" class="primary-btn" @click="exportMd">下载 .md</button>
        <button type="button" class="ghost-btn" @click="exportHtml">下载 HTML</button>
        <button type="button" class="ghost-btn" @click="loadSample">载入示例</button>
      </div>
    </header>

    <p class="hint">
      阅读模式：<strong>{{ readingLabel }}</strong>；图表主题：<strong>{{ activeChartThemeLabel }}</strong>；布局：
      <strong>{{ LAYOUT_OPTIONS.find((o) => o.value === layout)?.label }}</strong>
    </p>

    <main class="main" :class="`layout-${layout}`">
      <section v-show="layout !== 'preview'" class="pane editor-pane" aria-label="源码编辑">
        <h2 class="pane-title">源码</h2>
        <div class="pane-body">
          <SourceEditor v-model="source" language="markdown" />
        </div>
      </section>
      <section v-show="layout !== 'code'" class="pane preview-pane" aria-label="预览">
        <h2 class="pane-title">预览</h2>
        <div v-if="topError" class="error-banner" role="alert">
          {{ topError }}
        </div>
        <div class="pane-body preview-scroll">
          <div class="markdown-preview-wrap" :class="previewWrapClass">
            <div ref="previewHost" class="markdown-body" />
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.markdown-preview-wrap {
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-height: 2rem;
}

.reading-light {
  --md-text: #1a1d24;
  --md-muted: #5c6578;
  --md-bg: #f9fafb;
  --md-border: #e5e7eb;
  --md-code-bg: #f3f4f6;
  background: var(--md-bg);
  color: var(--md-text);
}

.reading-dark {
  --md-text: #e5e7eb;
  --md-muted: #9ca3af;
  --md-bg: #1f2937;
  --md-border: #374151;
  --md-code-bg: #111827;
  background: var(--md-bg);
  color: var(--md-text);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 0.75rem 0 0.35rem;
  line-height: 1.25;
}

.markdown-body :deep(p) {
  margin: 0.5rem 0;
}

.markdown-body :deep(a) {
  color: var(--accent, #2563eb);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  font-size: 0.875rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--md-border);
  padding: 0.35rem 0.5rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.25rem;
}

.markdown-body :deep(pre) {
  background: var(--md-code-bg);
  padding: 0.75rem;
  border-radius: 6px;
  overflow: auto;
  font-size: 0.8125rem;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.markdown-body :deep(.mermaid-block) {
  margin: 1rem 0;
}

.markdown-body :deep(.mermaid-error) {
  font-size: 0.8125rem;
  color: var(--error-text, #991b1b);
  white-space: pre-wrap;
}

.reading-dark .markdown-body :deep(.mermaid-error) {
  color: #fca5a5;
}
</style>
