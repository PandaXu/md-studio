<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const customExtensions = [
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
]

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit,
    Markdown,
    ...customExtensions,
  ],
  onUpdate: ({ editor: e }) => {
    if (!e) return
    const md = (e as any).getMarkdown() as string
    emit('update:modelValue', md)
  },
})

watch(
  () => props.modelValue,
  (v) => {
    const instance = editor.value
    if (!instance) return
    const currentMd = (instance as any).getMarkdown() as string
    if (v !== currentMd) {
      instance.commands.setContent(v)
    }
  },
)

function toggleBold() { editor.value?.chain().focus().toggleBold().run() }
function toggleItalic() { editor.value?.chain().focus().toggleItalic().run() }
function toggleHeading(level: 1 | 2 | 3) { editor.value?.chain().focus().toggleHeading({ level }).run() }
function toggleBulletList() { editor.value?.chain().focus().toggleBulletList().run() }
function toggleOrderedList() { editor.value?.chain().focus().toggleOrderedList().run() }
function toggleCodeBlock() { editor.value?.chain().focus().toggleCodeBlock().run() }
function toggleBlockquote() { editor.value?.chain().focus().toggleBlockquote().run() }
function setHorizontalRule() { editor.value?.chain().focus().setHorizontalRule().run() }

const isActive = (name: string, attrs?: Record<string, unknown>) =>
  editor.value?.isActive(name, attrs) ?? false
</script>

<template>
  <div v-if="editor" class="tiptap-wrapper">
    <div class="tiptap-toolbar">
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('bold') }"
        title="加粗 (Ctrl+B)"
        @click="toggleBold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('italic') }"
        title="斜体 (Ctrl+I)"
        @click="toggleItalic"
      >
        <em>I</em>
      </button>
      <span class="tiptap-sep" />
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('heading', { level: 1 }) }"
        title="标题 1"
        @click="toggleHeading(1)"
      >
        H1
      </button>
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('heading', { level: 2 }) }"
        title="标题 2"
        @click="toggleHeading(2)"
      >
        H2
      </button>
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('heading', { level: 3 }) }"
        title="标题 3"
        @click="toggleHeading(3)"
      >
        H3
      </button>
      <span class="tiptap-sep" />
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('bulletList') }"
        title="无序列表"
        @click="toggleBulletList"
      >
        &bull; List
      </button>
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('orderedList') }"
        title="有序列表"
        @click="toggleOrderedList"
      >
        1. List
      </button>
      <span class="tiptap-sep" />
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('codeBlock') }"
        title="代码块"
        @click="toggleCodeBlock"
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        class="tiptap-btn"
        :class="{ active: isActive('blockquote') }"
        title="引用"
        @click="toggleBlockquote"
      >
        &ldquo;
      </button>
      <button
        type="button"
        class="tiptap-btn"
        title="分割线"
        @click="setHorizontalRule"
      >
        &mdash;
      </button>
    </div>
    <EditorContent :editor="editor" class="tiptap-content" />
  </div>
</template>

<style scoped>
.tiptap-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tiptap-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--bg, #f4f5f7);
  flex-shrink: 0;
}

.tiptap-btn {
  font: inherit;
  font-size: 0.8125rem;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text, #1a1d24);
  cursor: pointer;
  min-width: 28px;
  text-align: center;
}

.tiptap-btn:hover {
  background: var(--surface, #fff);
  border-color: var(--border, #e5e7eb);
}

.tiptap-btn.active {
  background: var(--accent, #2563eb);
  color: #fff;
  border-color: var(--accent, #2563eb);
}

.tiptap-sep {
  width: 1px;
  height: 20px;
  background: var(--border, #e5e7eb);
  margin: 0 4px;
}

.tiptap-content {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.25rem;
}

.tiptap-content :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
  font-size: 0.9375rem;
  line-height: 1.7;
}

.tiptap-content :deep(h1) { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.75rem; line-height: 1.28; }
.tiptap-content :deep(h2) { font-size: 1.25rem; font-weight: 650; margin: 1.5rem 0 0.5rem; line-height: 1.28; }
.tiptap-content :deep(h3) { font-size: 1.0625rem; font-weight: 650; margin: 1.25rem 0 0.5rem; }
.tiptap-content :deep(p) { margin: 0 0 0.75rem; }
.tiptap-content :deep(ul),
.tiptap-content :deep(ol) { padding-left: 1.5rem; margin: 0.5rem 0; }
.tiptap-content :deep(li) { margin: 0.25rem 0; }
.tiptap-content :deep(blockquote) { border-left: 3px solid var(--border, #d8dce3); padding-left: 1rem; color: var(--muted, #5c6578); margin: 0.75rem 0; }
.tiptap-content :deep(pre) { background: var(--code-bg, #f4f5f7); padding: 0.75rem 1rem; border-radius: 6px; overflow: auto; margin: 0.75rem 0; }
.tiptap-content :deep(code) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.9em; }
.tiptap-content :deep(p code),
.tiptap-content :deep(li code) { padding: 0.12em 0.4em; border-radius: 4px; background: var(--code-bg, #f4f5f7); font-size: 0.88em; }
.tiptap-content :deep(pre code) { padding: 0; border-radius: 0; background: transparent; font-size: inherit; }
.tiptap-content :deep(table) { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
.tiptap-content :deep(th),
.tiptap-content :deep(td) { border: 1px solid var(--border, #d8dce3); padding: 0.35rem 0.6rem; text-align: left; }
.tiptap-content :deep(th) { font-weight: 600; background: var(--bg, #f4f5f7); }
.tiptap-content :deep(hr) { border: none; border-top: 1px solid var(--border, #e5e7eb); margin: 1.25rem 0; }
.tiptap-content :deep(img) { max-width: 100%; height: auto; }
.tiptap-content :deep(a) { color: var(--accent, #2563eb); }
.tiptap-content :deep(.task-list) { list-style: none; padding-left: 0; }
.tiptap-content :deep(.task-list li) { display: flex; align-items: flex-start; gap: 0.4em; }
.tiptap-content :deep(.task-list li label) { margin-top: 0.15em; }
</style>
