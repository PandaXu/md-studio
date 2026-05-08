# TUI Editor Markdown UX Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main Markdown editor with `tui.editor` (default WYSIWYG) while preserving the existing preview, Mermaid, import/export, layout, and persistence behavior.

**Architecture:** Keep `source` as the single Markdown source-of-truth in `MarkdownEditorView`. Introduce a dedicated `TuiEditor` wrapper component for editor lifecycle and mode switching, then continue feeding `source` into the existing `markdown-it + sanitize + mermaid` pipeline. Preserve `FloatingSourceEditor` for preview line mapping fallback in v1.

**Tech Stack:** Vue 3 + TypeScript, Vite, `@toast-ui/editor`, existing `markdown-it`, existing Mermaid pipeline.

---

## File Structure (planned changes)

- Create: `src/components/TuiEditor.vue`
  - Wrap `@toast-ui/editor` and expose `v-model` + mode switch.
- Create: `src/types/tui-editor.d.ts`
  - Provide minimal module declarations if typing gaps appear.
- Modify: `src/views/MarkdownEditorView.vue`
  - Replace `SourceEditor` main-pane usage with `TuiEditor`.
  - Add edit-mode state persistence and toolbar controls.
- Modify: `src/styles/editor-shell.css`
  - Add editor container sizing/overflow compatibility for TUI.
- Modify: `package.json`
  - Add `@toast-ui/editor` dependency.

---

### Task 1: Add TUI Editor dependency and type-safe integration baseline

**Files:**
- Modify: `package.json`
- Create: `src/types/tui-editor.d.ts`
- Test: `npm run typecheck`

- [ ] **Step 1: Write the failing test (typecheck baseline)**

```ts
// Expected failing state before dependency is installed:
// import Editor from '@toast-ui/editor' // TS2307 cannot find module
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`  
Expected: FAIL once `@toast-ui/editor` import is introduced without dependency/types.

- [ ] **Step 3: Add minimal implementation**

```json
{
  "dependencies": {
    "@toast-ui/editor": "latest"
  }
}
```

```ts
// src/types/tui-editor.d.ts
declare module '@toast-ui/editor'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm run typecheck`  
Expected: PASS (or next failing point only in yet-unimplemented component code).

- [ ] **Step 5: Commit**

```bash
git add package.json src/types/tui-editor.d.ts
git commit -m "build: add toast ui editor dependency baseline"
```

---

### Task 2: Implement `TuiEditor` wrapper with TDD around source/mode sync

**Files:**
- Create: `src/components/TuiEditor.vue`
- Test: `npm run typecheck`

- [ ] **Step 1: Write the failing test (contract-first component skeleton)**

```vue
<!-- src/components/TuiEditor.vue (initial failing skeleton) -->
<script setup lang="ts">
defineProps<{ modelValue: string; mode: 'wysiwyg' | 'markdown' }>()
defineEmits<{ 'update:modelValue': [value: string]; 'update:mode': [value: 'wysiwyg' | 'markdown'] }>()
throw new Error('TuiEditor runtime not implemented yet')
</script>
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`  
Expected: FAIL due to missing runtime integration symbols/functions used by parent later.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import '@toast-ui/editor/dist/toastui-editor.css'
import Editor from '@toast-ui/editor'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type EditMode = 'wysiwyg' | 'markdown'

const props = defineProps<{
  modelValue: string
  mode: EditMode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:mode': [value: EditMode]
}>()

const host = ref<HTMLElement | null>(null)
let editor: any = null
let syncingFromParent = false

onMounted(() => {
  if (!host.value) return
  editor = new Editor({
    el: host.value,
    initialValue: props.modelValue,
    initialEditType: props.mode,
    previewStyle: 'vertical',
    height: '100%',
  })
  editor.on('change', () => {
    if (syncingFromParent) return
    emit('update:modelValue', editor.getMarkdown())
  })
})

watch(
  () => props.modelValue,
  (next) => {
    if (!editor) return
    const cur = editor.getMarkdown()
    if (cur === next) return
    syncingFromParent = true
    editor.setMarkdown(next, false)
    syncingFromParent = false
  },
)

watch(
  () => props.mode,
  (next) => {
    if (!editor) return
    if (editor.isWysiwygMode() && next === 'wysiwyg') return
    if (editor.isMarkdownMode() && next === 'markdown') return
    editor.changeMode(next)
    emit('update:mode', next)
  },
)

onBeforeUnmount(() => {
  editor?.destroy?.()
  editor = null
})
</script>

<template>
  <div class="tui-editor-host-wrap">
    <div ref="host" class="tui-editor-host" />
  </div>
</template>

<style scoped>
.tui-editor-host-wrap,
.tui-editor-host {
  height: 100%;
  min-height: 240px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck`  
Expected: PASS for `TuiEditor` API and type-level integration.

- [ ] **Step 5: Commit**

```bash
git add src/components/TuiEditor.vue
git commit -m "feat: add tui editor wrapper with v-model sync"
```

---

### Task 3: Replace main Markdown editor usage and preserve existing UX features

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`
- Modify: `src/styles/editor-shell.css`
- Test: `npm run typecheck`

- [ ] **Step 1: Write the failing test (integration contract at view layer)**

```ts
// Integration expectations after refactor:
// 1) view has editMode state with persisted key
// 2) main pane uses <TuiEditor v-model="source" v-model:mode="editMode" />
// 3) existing preview pipeline still watches debouncedSource from source
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`  
Expected: FAIL until `editMode` state and `TuiEditor` binding are wired.

- [ ] **Step 3: Write minimal implementation**

```ts
// MarkdownEditorView.vue (script section additions)
import TuiEditor from '@/components/TuiEditor.vue'

type EditMode = 'wysiwyg' | 'markdown'
const EDIT_MODE_KEY = 'markdown-editor-edit-mode'

function loadStoredEditMode(): EditMode {
  try {
    const v = localStorage.getItem(EDIT_MODE_KEY)
    if (v === 'wysiwyg' || v === 'markdown') return v
  } catch {
    /* ignore */
  }
  return 'wysiwyg'
}

function persistEditMode(mode: EditMode) {
  try {
    localStorage.setItem(EDIT_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

const editMode = ref<EditMode>(loadStoredEditMode())
watch(editMode, persistEditMode)
```

```vue
<!-- MarkdownEditorView.vue (template main editor replacement) -->
<TuiEditor v-model="source" v-model:mode="editMode" />
```

```css
/* src/styles/editor-shell.css (ensure pane body supports TUI full-height editor) */
.pane-body {
  min-height: 0;
}

.editor-pane .pane-body {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck`  
Expected: PASS with route/page compile success.

- [ ] **Step 5: Commit**

```bash
git add src/views/MarkdownEditorView.vue src/styles/editor-shell.css
git commit -m "feat: switch markdown main editor to tui with mode persistence"
```

---

### Task 4: Verify no regression in preview, Mermaid, import/export, and layouts

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`
- Modify: `src/components/TuiEditor.vue`
- Modify: `src/styles/editor-shell.css`
- Test: `npm run typecheck`

- [ ] **Step 1: Write the failing test (manual regression checklist as executable protocol)**

```md
1. Open `/markdown`, confirm default mode is WYSIWYG.
2. Toggle to Markdown mode, refresh page, confirm mode persists.
3. Paste Mermaid block, confirm preview renders and theme switch still works.
4. Load local `.md` file, confirm editor + preview both update.
5. Load markdown via URL, confirm editor + preview both update.
6. Download `.md` and `.html`, confirm content correctness.
7. Switch `split/code/preview`, confirm each layout is usable.
8. Double-click preview block, confirm FloatingSourceEditor opens and jumps.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run dev` and execute the checklist above.  
Expected: For each checklist item, record explicit PASS/FAIL. If any item is FAIL, continue to Step 3 and fix all failed items.

- [ ] **Step 3: Write minimal implementation fixes for failed checklist items**

```ts
// Apply this mapping for each failed checklist item:
// Item 1/2 fails (default mode or persistence):
//   - file: src/views/MarkdownEditorView.vue
//   - fix: ensure editMode default is 'wysiwyg' and watch(editMode, persistEditMode) exists.
//
// Item 3 fails (Mermaid/theme):
//   - file: src/views/MarkdownEditorView.vue
//   - fix: keep runMarkdownPipeline(), watch(chartTheme, ...), renderMermaidBlocksIn(...) unchanged.
//
// Item 4/5 fails (load local/URL not syncing editor):
//   - file: src/components/TuiEditor.vue
//   - fix: keep watch(() => props.modelValue, ...) + editor.setMarkdown(next, false).
//
// Item 6 fails (export mismatch):
//   - file: src/views/MarkdownEditorView.vue
//   - fix: ensure exportMd() uses source.value and exportHtml() uses previewHost clone path.
//
// Item 7 fails (layout unusable):
//   - file: src/styles/editor-shell.css
//   - fix: enforce .pane-body { min-height: 0 } and editor pane flex sizing.
//
// Item 8 fails (dblclick mapping):
//   - file: src/views/MarkdownEditorView.vue
//   - fix: keep onPreviewDblClick() -> openFloatingEditor(line) route active.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck` and re-run the full checklist in `npm run dev`.  
Expected: All checklist items PASS; no blocker-level regressions.

- [ ] **Step 5: Commit**

```bash
git add src/views/MarkdownEditorView.vue src/components/TuiEditor.vue src/styles/editor-shell.css
git commit -m "fix: preserve markdown preview and toolchain behaviors after tui migration"
```

---

### Task 5: Final verification and handoff notes

**Files:**
- Modify: `docs/superpowers/specs/2026-05-08-tui-editor-markdown-ux-design.md`
- Create: `docs/superpowers/notes/2026-05-08-tui-editor-migration.md`
- Test: `npm run typecheck`, `npm run build`

- [ ] **Step 1: Write failing test (release gate criteria)**

```md
Release fails unless:
- Typecheck passes
- Build passes
- Regression checklist fully passes
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck && npm run build`  
Expected: FAIL if any compile/type/build issue remains.

- [ ] **Step 3: Write minimal implementation/doc updates**

```md
Document:
- New dependency (`@toast-ui/editor`)
- Default WYSIWYG mode behavior
- Mode persistence key and fallback behavior
- Known limitation: preview dblclick still routes via FloatingSourceEditor in v1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: finalize tui editor markdown ux migration"
```
