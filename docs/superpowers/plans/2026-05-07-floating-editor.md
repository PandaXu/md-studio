# 预览区双击弹窗编辑 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Markdown 和 Mermaid 预览区双击弹出 Monaco 浮动编辑框，实时编辑源码

**Architecture:** 新建共享组件 `FloatingSourceEditor.vue` 封装 Monaco 编辑器 + 模态弹窗，通过 v-model 与视图的 `source` ref 绑定。两个视图各自加入双击事件和组件引用。

**Tech Stack:** Vue 3 + Monaco Editor + Teleport

---

### Task 1: Create FloatingSourceEditor.vue component

**Files:**
- Create: `src/components/FloatingSourceEditor.vue`

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
import * as monaco from 'monaco-editor'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    title?: string
  }>(),
  { language: 'plaintext', title: '源码编辑' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const visible = ref(false)
const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

function open() {
  visible.value = true
  nextTick(() => createEditor())
}

function close() {
  disposeEditor()
  visible.value = false
}

function toggle() {
  if (visible.value) close()
  else open()
}

function createEditor() {
  if (!host.value || editor) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
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
}

function disposeEditor() {
  editor?.dispose()
  editor = null
}

watch(
  () => props.modelValue,
  (v) => {
    if (!editor) return
    const cur = editor.getValue()
    if (v !== cur) editor.setValue(v)
  },
)

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && visible.value) close()
}

watch(visible, (val) => {
  if (val) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  disposeEditor()
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ open, close, toggle })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="floating-overlay" @click.self="close">
      <div class="floating-dialog" role="dialog" aria-modal="true" :aria-label="title" @click.stop>
        <header class="floating-header">
          <h3 class="floating-title">{{ title }}</h3>
          <button type="button" class="floating-close" aria-label="关闭" @click="close">&times;</button>
        </header>
        <div ref="host" class="floating-editor-host" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.floating-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 51;
}

.floating-dialog {
  display: flex;
  flex-direction: column;
  width: 80vw;
  height: 75vh;
  max-width: 960px;
  max-height: 720px;
  border-radius: 10px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  overflow: hidden;
}

.floating-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.floating-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.floating-close {
  font: inherit;
  font-size: 1.125rem;
  padding: 0.15rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--muted, #5c6578);
  cursor: pointer;
  border-radius: 4px;
}

.floating-close:hover {
  background: var(--bg, #f4f5f7);
  color: var(--text, #1a1d24);
}

.floating-editor-host {
  flex: 1;
  min-height: 0;
}
</style>
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx vue-tsc --noEmit src/components/FloatingSourceEditor.vue`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/FloatingSourceEditor.vue
git commit -m "feat: add FloatingSourceEditor component for preview double-click editing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Wire up floating editor in MarkdownEditorView

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`

- [ ] **Step 1: Import and add ref + handler**

In the `<script setup>` section, add the import after `import SourceEditor from '@/components/SourceEditor.vue'`:

```typescript
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
```

Add after `const fileInputRef = ref<HTMLInputElement | null>(null)` (line 116):

```typescript
const floatingEditorRef = ref<InstanceType<typeof FloatingSourceEditor> | null>(null)

function openFloatingEditor() {
  floatingEditorRef.value?.open()
}
```

- [ ] **Step 2: Add template ref and dblclick binding**

In the `<template>`, change the preview section (around line 533):

From:
```html
<div class="pane-body preview-scroll">
  <div class="markdown-preview-wrap" :class="previewWrapClass">
    <div ref="previewHost" class="markdown-body" />
  </div>
</div>
```

To:
```html
<div class="pane-body preview-scroll" @dblclick="openFloatingEditor">
  <div class="markdown-preview-wrap" :class="previewWrapClass">
    <div ref="previewHost" class="markdown-body" />
  </div>
</div>
```

- [ ] **Step 3: Add the floating editor component to template**

Add after `</Teleport>` (end of the load-url dialog, before `</div>` for `.editor-page`):

```html
<FloatingSourceEditor
  ref="floatingEditorRef"
  v-model="source"
  language="markdown"
  title="Markdown 源码编辑"
/>
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/MarkdownEditorView.vue
git commit -m "feat: wire floating editor double-click in Markdown preview

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Wire up floating editor in MermaidEditorView

**Files:**
- Modify: `src/views/MermaidEditorView.vue`

- [ ] **Step 1: Import and add ref + handler**

In the `<script setup>` section, add the import after `import SourceEditor from '@/components/SourceEditor.vue'`:

```typescript
import FloatingSourceEditor from '@/components/FloatingSourceEditor.vue'
```

Add after `const previewHost = ref<HTMLElement | null>(null)` (line 73):

```typescript
const floatingEditorRef = ref<InstanceType<typeof FloatingSourceEditor> | null>(null)

function openFloatingEditor() {
  floatingEditorRef.value?.open()
}
```

- [ ] **Step 2: Add dblclick binding on preview pane**

In the `<template>`, change the mermaid preview section (around line 244):

From:
```html
<div class="pane-body preview-scroll">
  <div ref="previewHost" class="mermaid-out" />
</div>
```

To:
```html
<div class="pane-body preview-scroll" @dblclick="openFloatingEditor">
  <div ref="previewHost" class="mermaid-out" />
</div>
```

- [ ] **Step 3: Add the floating editor component to template**

Add after `</main>` (end of main, before `</div>` for `.editor-page`):

```html
<FloatingSourceEditor
  ref="floatingEditorRef"
  v-model="source"
  title="Mermaid 源码编辑"
/>
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/MermaidEditorView.vue
git commit -m "feat: wire floating editor double-click in Mermaid preview

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start dev server and check Markdown page**

Run: `npm run dev`
- Open `/markdown` in browser
- In split mode, double-click the preview pane → floating editor opens with Monaco + markdown highlighting
- Edit in floating editor → preview updates in real time
- Close with X, background click, Esc → all work
- Switch to `preview` mode, double-click → still works
- Switch to `code` mode → preview hidden, no dblclick target

- [ ] **Step 2: Check Mermaid page**

- Navigate to `/mermaid`
- Same tests as above
- Floating editor shows plaintext Monaco (no mermaid grammar)

- [ ] **Step 3: Confirm two-editor sync**

- In `split` mode, open floating editor
- Edit in floating editor → Monaco in side panel reflects changes
- Edit in side panel → floating editor reflects changes
