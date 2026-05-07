/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MD_FETCH_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt, options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }) => void
  export default plugin
}

declare module '*.md?raw' {
  const content: string
  export default content
}
