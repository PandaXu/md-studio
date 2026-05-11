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

type FileNode = {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: FileNode[]
}

interface ElectronFileAPI {
  selectFolder(): Promise<string | null>
  scanFolder(folderPath: string): Promise<FileNode[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  createFile(parentPath: string, name: string): Promise<string>
  createFolder(parentPath: string, name: string): Promise<string>
  deleteFile(filePath: string): Promise<void>
  deleteFolder(folderPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  onFileChanged(callback: (event: { path: string; type: 'change' | 'rename' | 'delete' }) => void): () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronFileAPI
  }
}
