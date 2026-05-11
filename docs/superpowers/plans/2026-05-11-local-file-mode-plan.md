# 本地文件模式 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文件管理面板底部增加本地/Web 模式切换，Electron 环境下直接操作本地文件系统（打开文件夹 → 文件树 → 编辑 → 自动保存），支持新建/删除/重命名文件及文件夹。

**Architecture:** 新增 `useLocalWorkspace` composable 通过 Electron IPC 操作文件系统，将 `FileNode[]` 映射为 `Doc[]`/`FolderRecord[]` 复用现有 `DocumentLibraryPanel` UI。`FileModeSwitch` 组件吸底放置，控制模式切换。Web 模式（IndexedDB）完全不动。

**Tech Stack:** Vue 3 + TypeScript + Electron (IPC + Node.js fs/path) + Vitest

---

### Task 1: 搭建测试框架

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 安装 vitest**

Run: `npm install -D vitest @vue/test-utils happy-dom`
Expected: 安装成功，无报错

- [ ] **Step 2: 创建 vitest.config.ts**

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 3: 添加 test 脚本到 package.json**

在 `package.json` 的 `scripts` 中增加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 验证测试框架**

Run: `npm test`
Expected: "No test files found"（框架就绪，尚无测试文件）

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: 搭建 vitest 测试框架"
```

---

### Task 2: Electron 类型声明

**Files:**
- Modify: `env.d.ts`

- [ ] **Step 1: 添加 window.electronAPI 类型**

在 `env.d.ts` 末尾追加：

```ts
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
```

- [ ] **Step 2: 提交**

```bash
git add env.d.ts
git commit -m "types: 添加 Electron File API 类型声明"
```

---

### Task 3: useLocalWorkspace 的 FileNode → Doc/FolderRecord 映射（纯逻辑 + 测试）

**Files:**
- Create: `src/composables/useLocalWorkspace.ts`（仅映射函数）
- Create: `src/composables/useLocalWorkspace.test.ts`

- [ ] **Step 1: 写映射逻辑**

创建 `src/composables/useLocalWorkspace.ts`：

```ts
import type { Doc, FolderRecord } from '@/markdown/documentStore'
// FileNode 类型在 env.d.ts 中全局声明，此处直接使用

export function fileNodeToDoc(node: FileNode): Doc {
  const title = node.name.replace(/\.md$/i, '')
  return {
    id: node.path,
    folderId: null, // 后续在 buildTree 中由父目录覆盖
    title,
    titleLocked: true,
    content: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

export function fileNodeToFolder(node: FileNode): FolderRecord {
  return {
    id: node.path,
    kind: 'folder',
    title: node.name,
    parentId: null, // 后续在 buildTree 中由父目录覆盖
    createdAt: 0,
    updatedAt: 0,
  }
}

export type LocalTree = {
  docs: Doc[]
  folders: FolderRecord[]
}

export function buildLocalTree(nodes: FileNode[]): LocalTree {
  const docs: Doc[] = []
  const folders: FolderRecord[] = []

  function walk(list: FileNode[], parentPath: string | null) {
    for (const node of list) {
      if (node.kind === 'file' && /\.md$/i.test(node.name)) {
        const doc = fileNodeToDoc(node)
        doc.folderId = parentPath
        docs.push(doc)
      } else if (node.kind === 'dir') {
        const folder = fileNodeToFolder(node)
        folder.parentId = parentPath
        folders.push(folder)
        if (node.children && node.children.length > 0) {
          walk(node.children, node.path)
        }
      }
    }
  }

  walk(nodes, null)
  return { docs, folders }
}
```

- [ ] **Step 2: 写测试**

创建 `src/composables/useLocalWorkspace.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildLocalTree } from './useLocalWorkspace'
// FileNode 为 env.d.ts 中声明的全局类型，无需导入

describe('buildLocalTree', () => {
  it('maps flat files to docs with null folderId', () => {
    const nodes: FileNode[] = [
      { name: 'readme.md', path: 'readme.md', kind: 'file' },
      { name: 'notes.md', path: 'notes.md', kind: 'file' },
    ]
    const { docs, folders } = buildLocalTree(nodes)
    expect(docs).toHaveLength(2)
    expect(docs[0].id).toBe('readme.md')
    expect(docs[1].id).toBe('notes.md')
    expect(docs[0].folderId).toBeNull()
    expect(docs[0].titleLocked).toBe(true)
    expect(folders).toHaveLength(0)
  })

  it('maps nested directories to folders with parentId', () => {
    const nodes: FileNode[] = [
      {
        name: 'docs',
        path: 'docs',
        kind: 'dir',
        children: [
          { name: 'api.md', path: 'docs/api.md', kind: 'file' },
          {
            name: 'guides',
            path: 'docs/guides',
            kind: 'dir',
            children: [
              { name: 'start.md', path: 'docs/guides/start.md', kind: 'file' },
            ],
          },
        ],
      },
    ]
    const { docs, folders } = buildLocalTree(nodes)

    expect(folders).toHaveLength(2)
    expect(folders[0].id).toBe('docs')
    expect(folders[0].parentId).toBeNull()
    expect(folders[1].id).toBe('docs/guides')
    expect(folders[1].parentId).toBe('docs')

    expect(docs).toHaveLength(2)
    expect(docs[0].folderId).toBe('docs')
    expect(docs[1].folderId).toBe('docs/guides')
  })

  it('strips .md extension for title', () => {
    const nodes: FileNode[] = [
      { name: 'My Great Post.md', path: 'My Great Post.md', kind: 'file' },
    ]
    const { docs } = buildLocalTree(nodes)
    expect(docs[0].title).toBe('My Great Post')
  })

  it('skips non-md files', () => {
    const nodes: FileNode[] = [
      { name: 'image.png', path: 'image.png', kind: 'file' },
      { name: 'readme.md', path: 'readme.md', kind: 'file' },
    ]
    const { docs } = buildLocalTree(nodes)
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('readme.md')
  })

  it('handles empty input', () => {
    const { docs, folders } = buildLocalTree([])
    expect(docs).toHaveLength(0)
    expect(folders).toHaveLength(0)
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/composables/useLocalWorkspace.test.ts`
Expected: 5 tests PASS

- [ ] **Step 4: 提交**

```bash
git add src/composables/useLocalWorkspace.ts src/composables/useLocalWorkspace.test.ts
git commit -m "feat: FileNode → Doc/FolderRecord 映射逻辑"
```

---

### Task 4: Electron preload 脚本

**Files:**
- Create: `electron/preload.js`

- [ ] **Step 1: 创建 preload.js**

```js
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder() {
    return ipcRenderer.invoke('dialog:select-folder')
  },
  scanFolder(folderPath) {
    return ipcRenderer.invoke('fs:scan-folder', folderPath)
  },
  readFile(filePath) {
    return ipcRenderer.invoke('fs:read-file', filePath)
  },
  writeFile(filePath, content) {
    return ipcRenderer.invoke('fs:write-file', filePath, content)
  },
  createFile(parentPath, name) {
    return ipcRenderer.invoke('fs:create-file', parentPath, name)
  },
  createFolder(parentPath, name) {
    return ipcRenderer.invoke('fs:create-folder', parentPath, name)
  },
  deleteFile(filePath) {
    return ipcRenderer.invoke('fs:delete-file', filePath)
  },
  deleteFolder(folderPath) {
    return ipcRenderer.invoke('fs:delete-folder', folderPath)
  },
  rename(oldPath, newPath) {
    return ipcRenderer.invoke('fs:rename', oldPath, newPath)
  },
  onFileChanged(callback) {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('fs:file-changed', handler)
    return () => ipcRenderer.removeListener('fs:file-changed', handler)
  },
})
```

- [ ] **Step 2: 提交**

```bash
git add electron/preload.js
git commit -m "feat: Electron preload 暴露安全文件系统 API"
```

---

### Task 5: Electron 主进程文件系统 IPC Handlers

**Files:**
- Modify: `electron/main.cjs`

- [ ] **Step 1: 重写 electron/main.cjs**

```js
'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.ELECTRON_DEV === '1'

// --- 文件扫描 ---

const EXCLUDED_DIRS = new Set(['node_modules', '.git'])

function isHidden(name) {
  return name.startsWith('.')
}

function scanDir(dirPath) {
  const result = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  // 目录在前，文件在后，各自按名称排序
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const full = path.join(dirPath, entry.name)
    const rel = path.relative(workspaceRoot, full)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      const children = scanDir(full)
      result.push({ name: entry.name, path: rel, kind: 'dir', children })
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      result.push({ name: entry.name, path: rel, kind: 'file' })
    }
  }
  return result
}

let workspaceRoot = ''

// --- IPC Handlers ---

function registerIpcHandlers() {
  ipcMain.handle('dialog:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择工作区文件夹',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    workspaceRoot = result.filePaths[0]
    return workspaceRoot
  })

  ipcMain.handle('fs:scan-folder', (_event, folderPath) => {
    workspaceRoot = folderPath
    return scanDir(folderPath)
  })

  ipcMain.handle('fs:read-file', (_event, filePath) => {
    const full = path.join(workspaceRoot, filePath)
    return fs.readFileSync(full, 'utf-8')
  })

  ipcMain.handle('fs:write-file', (_event, filePath, content) => {
    const full = path.join(workspaceRoot, filePath)
    const dir = path.dirname(full)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
  })

  ipcMain.handle('fs:create-file', (_event, parentPath, name) => {
    const dir = parentPath ? path.join(workspaceRoot, parentPath) : workspaceRoot
    const fname = name.endsWith('.md') ? name : `${name}.md`
    const full = path.join(dir, fname)
    if (fs.existsSync(full)) throw new Error(`文件已存在: ${fname}`)
    fs.writeFileSync(full, '', 'utf-8')
    return path.relative(workspaceRoot, full)
  })

  ipcMain.handle('fs:create-folder', (_event, parentPath, name) => {
    const dir = parentPath ? path.join(workspaceRoot, parentPath) : workspaceRoot
    const full = path.join(dir, name)
    if (fs.existsSync(full)) throw new Error(`文件夹已存在: ${name}`)
    fs.mkdirSync(full, { recursive: true })
    return path.relative(workspaceRoot, full)
  })

  ipcMain.handle('fs:delete-file', (_event, filePath) => {
    const full = path.join(workspaceRoot, filePath)
    if (!fs.existsSync(full)) throw new Error(`文件不存在: ${filePath}`)
    fs.unlinkSync(full)
  })

  ipcMain.handle('fs:delete-folder', (_event, folderPath) => {
    const full = path.join(workspaceRoot, folderPath)
    if (!fs.existsSync(full)) throw new Error(`文件夹不存在: ${folderPath}`)
    fs.rmSync(full, { recursive: true, force: true })
  })

  ipcMain.handle('fs:rename', (_event, oldPath, newPath) => {
    const fullOld = path.join(workspaceRoot, oldPath)
    const fullNew = path.join(workspaceRoot, newPath)
    if (!fs.existsSync(fullOld)) throw new Error(`路径不存在: ${oldPath}`)
    if (fs.existsSync(fullNew)) throw new Error(`目标已存在: ${newPath}`)
    const newDir = path.dirname(fullNew)
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })
    fs.renameSync(fullOld, fullNew)
  })
}

// --- 窗口创建 ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'MD Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (isDev) {
    void win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    void win.loadFile(indexPath)
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 2: 手动验证 Electron 启动**

Run: `npm run electron:dev`
Expected: 窗口正常打开，DevTools 中 `window.electronAPI` 不为 undefined

- [ ] **Step 3: 提交**

```bash
git add electron/main.cjs
git commit -m "feat: Electron 主进程文件系统 IPC handlers（扫描/读写/新建/删除/重命名）"
```

---

### Task 6: FileModeSwitch 组件

**Files:**
- Create: `src/components/FileModeSwitch.vue`

- [ ] **Step 1: 创建 FileModeSwitch.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: 'local' | 'web'
  workspacePath: string | null
  isElectron: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: 'local' | 'web']
  selectFolder: []
}>()

const localDisabled = computed(() => !props.isElectron)

function switchTo(value: 'local' | 'web') {
  if (value === 'local' && localDisabled.value) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="file-mode-switch">
    <div v-if="modelValue === 'local' && workspacePath" class="file-mode-workspace" :title="workspacePath">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="file-mode-workspace-name">{{ workspacePath.split('/').pop() || workspacePath }}</span>
    </div>
    <button
      v-if="modelValue === 'local' && !workspacePath"
      type="button"
      class="file-mode-open-btn"
      @click="emit('selectFolder')"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      打开文件夹
    </button>

    <div class="file-mode-segment" role="radiogroup" aria-label="文件管理模式">
      <button
        type="button"
        role="radio"
        class="file-mode-seg-btn"
        :class="{ active: modelValue === 'local' }"
        :aria-checked="modelValue === 'local'"
        :disabled="localDisabled"
        :title="localDisabled ? '需在 MD Studio 桌面应用中启用' : '本地文件系统模式'"
        @click="switchTo('local')"
      >
        本地
      </button>
      <button
        type="button"
        role="radio"
        class="file-mode-seg-btn"
        :class="{ active: modelValue === 'web' }"
        :aria-checked="modelValue === 'web'"
        title="Web 模式（浏览器存储）"
        @click="switchTo('web')"
      >
        Web
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-mode-switch {
  margin-top: auto;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--doc-panel-border);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex-shrink: 0;
}

.file-mode-workspace {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--doc-panel-muted);
  padding: 0.15rem 0.3rem;
  overflow: hidden;
}

.file-mode-workspace svg {
  flex-shrink: 0;
}

.file-mode-workspace-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-mode-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px dashed var(--doc-panel-border);
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
}

.file-mode-open-btn:hover {
  background: var(--doc-panel-hover);
  color: var(--doc-panel-text);
}

.file-mode-segment {
  display: flex;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--doc-panel-border);
}

.file-mode-seg-btn {
  flex: 1;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.25rem 0.4rem;
  border: none;
  background: transparent;
  color: var(--doc-panel-muted);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.file-mode-seg-btn:hover:not(:disabled) {
  background: var(--doc-panel-hover);
}

.file-mode-seg-btn.active {
  background: var(--doc-panel-active-bg);
  color: var(--doc-panel-text);
}

.file-mode-seg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/FileModeSwitch.vue
git commit -m "feat: FileModeSwitch 吸底模式切换组件"
```

---

### Task 7: DocumentLibraryPanel 集成 FileModeSwitch + 本地模式工具栏适配

**Files:**
- Modify: `src/components/DocumentLibraryPanel.vue`

改动点：
1. Template 底部 `</aside>` 前插入 `FileModeSwitch`
2. 新增 props: `fileMode`, `workspacePath`, `isElectron`
3. 新增 emits: `update:fileMode`, `selectLocalFolder`
4. 工具栏按钮按模式条件渲染

- [ ] **Step 1: 在 script 中新增 props 和 emits**

在 props 定义末尾追加：

```ts
fileMode: 'local' | 'web'
workspacePath: string | null
isElectron: boolean
```

在 emits 定义中追加：

```ts
'update:fileMode': [value: 'local' | 'web']
selectLocalFolder: []
```

在 import 区域添加：

```ts
import FileModeSwitch from '@/components/FileModeSwitch.vue'
```

添加一个 computed 判断是否为本地模式：

```ts
const isLocalMode = computed(() => props.fileMode === 'local')
```

- [ ] **Step 2: 工具栏按钮条件渲染**

将新建文件夹按钮和新建文档按钮包裹 `v-if="!isLocalMode"` 和 `v-else` 分别处理。本地模式下新建/删除通过 IPC 操作且工具栏保留"新建文档""新建文件夹"按钮（本地模式下这些 emit 会被上层转为 IPC 调用）。

实际上，工具栏的"新建文档""新建文件夹"按钮在本地和 Web 模式下都显示，都 emit 相同事件。区别在于：
- 导入菜单 (DocumentImportMenu)、下载按钮 → 本地模式下隐藏
- 其他按钮保持不变

修改模板：给导入菜单和下载按钮加 `v-if="!isLocalMode"`。

- [ ] **Step 3: 底部插入 FileModeSwitch**

在 `</aside>` 之前（Teleport 内容之后）追加：

```html
<FileModeSwitch
  :model-value="fileMode"
  :workspace-path="workspacePath"
  :is-electron="isElectron"
  @update:model-value="(v) => emit('update:fileMode', v)"
  @select-folder="emit('selectLocalFolder')"
/>
```

- [ ] **Step 4: 提交**

```bash
git add src/components/DocumentLibraryPanel.vue
git commit -m "feat: 文件管理面板集成模式切换和本地模式工具栏适配"
```

---

### Task 8: useLocalWorkspace 完整 composable（状态 + IPC 操作）

**Files:**
- Modify: `src/composables/useLocalWorkspace.ts`（追加状态管理和 IPC 操作）

在已有的映射函数基础上追加：

- [ ] **Step 1: 追加 useLocalWorkspace composable**

在 `src/composables/useLocalWorkspace.ts` 文件顶部已有 import 行之后，追加 Vue 相关 import：

```ts
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
```

在已有映射函数（`fileNodeToDoc`, `fileNodeToFolder`, `buildLocalTree`）之前，加入 path 工具函数：

```ts
// 简易 path 工具（避免依赖 Node path 模块，浏览器/Electron 渲染进程通用）
function joinPath(...segs: string[]): string {
  return segs
    .map((s) => s.replace(/\/+$/, '').replace(/^\/+/, ''))
    .filter(Boolean)
    .join('/')
}
function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '.' : p.slice(0, i)
}
```

在文件末尾追加 composable 实现：

```ts
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

export type LocalWorkspaceHandle = {
  // 状态
  workspacePath: Ref<string | null>
  docs: Ref<Doc[]>
  folders: Ref<FolderRecord[]>
  activeId: Ref<string | null>
  activeContent: Ref<string>
  searchQuery: Ref<string>
  filteredDocs: ComputedRef<Doc[]>
  hasItems: ComputedRef<boolean>
  treeMode: ComputedRef<boolean>
  hasWorkspace: ComputedRef<boolean>

  // 操作
  openFolder(): Promise<void>
  refreshTree(): Promise<void>
  setActive(id: string): Promise<void>
  createDoc(parentPath: string | null): Promise<void>
  createFolder(parentPath: string | null, name: string): Promise<void>
  deleteDoc(id: string): Promise<void>
  deleteFolder(id: string): Promise<void>
  renameDoc(id: string, newName: string): Promise<void>
  renameFolder(id: string, newName: string): Promise<void>
  flush(): Promise<void>
}

export function useLocalWorkspace(): LocalWorkspaceHandle {
  const api = window.electronAPI
  const workspacePath = ref<string | null>(null)
  const docs = ref<Doc[]>([])
  const folders = ref<FolderRecord[]>([])
  const activeId = ref<string | null>(null)
  const activeContent = ref('')
  const searchQuery = ref('')
  const rawNodes = ref<FileNode[]>([])

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let dirty = false

  const hasWorkspace = computed(() => !!workspacePath.value)

  const filteredDocs = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return docs.value
    return docs.value.filter((d) => d.title.toLowerCase().includes(q))
  })

  const hasItems = computed(() => docs.value.length > 0 || folders.value.length > 0)
  const treeMode = computed(() => searchQuery.value.trim().length === 0)

  function applyTree(nodes: FileNode[]) {
    rawNodes.value = nodes
    const tree = buildLocalTree(nodes)
    docs.value = tree.docs
    folders.value = tree.folders
  }

  async function openFolder() {
    if (!api) return
    const p = await api.selectFolder()
    if (!p) return
    workspacePath.value = p
    await refreshTree()
  }

  async function refreshTree() {
    if (!api || !workspacePath.value) return
    const nodes = await api.scanFolder(workspacePath.value)
    applyTree(nodes)
    // 如果当前 activeId 对应的文件不存在了则清空
    if (activeId.value && !docs.value.find((d) => d.id === activeId.value)) {
      activeId.value = null
      activeContent.value = ''
    }
  }

  async function setActive(id: string) {
    if (!api || !workspacePath.value) return
    await flush()
    const doc = docs.value.find((d) => d.id === id)
    if (!doc) return
    activeId.value = id
    activeContent.value = await api.readFile(joinPath(workspacePath.value, id))
    dirty = false
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void flush()
    }, 320)
  }

  watch(activeContent, () => {
    if (!activeId.value) return
    dirty = true
    scheduleSave()
  })

  async function flush() {
    if (!api || !workspacePath.value || !activeId.value || !dirty) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await api.writeFile(activeId.value, activeContent.value)
    dirty = false
    // 更新内存中的 doc content 以保持同步
    const doc = docs.value.find((d) => d.id === activeId.value)
    if (doc) doc.content = activeContent.value
  }

  async function createDoc(parentPath: string | null) {
    if (!api || !workspacePath.value) return
    const base = parentPath ?? null
    let n = 1
    let name = '未命名文档.md'
    const siblings = docs.value.filter((d) => d.folderId === base).map((d) => d.title)
    while (siblings.includes(name.replace(/\.md$/i, ''))) {
      n++
      name = `未命名文档 ${n}.md`
    }
    await api.createFile(base ?? workspacePath.value, name)
    await refreshTree()
  }

  async function createFolder(parentPath: string | null, name: string) {
    if (!api || !workspacePath.value) return
    await api.createFolder(parentPath ?? workspacePath.value, name)
    await refreshTree()
  }

  async function deleteDoc(id: string) {
    if (!api || !workspacePath.value) return
    if (!window.confirm('确定删除该文件吗？此操作不可撤销。')) return
    await flush()
    await api.deleteFile(id)
    if (activeId.value === id) {
      activeId.value = null
      activeContent.value = ''
    }
    await refreshTree()
  }

  async function deleteFolder(id: string) {
    if (!api || !workspacePath.value) return
    if (!window.confirm('确定删除该文件夹及其中的全部文件吗？此操作不可撤销。')) return
    await flush()
    // 如果当前打开的文件在该文件夹下，先清空
    const currentDoc = activeId.value ? docs.value.find((d) => d.id === activeId.value) : null
    if (currentDoc && (currentDoc.folderId === id || currentDoc.folderId?.startsWith(id + '/'))) {
      activeId.value = null
      activeContent.value = ''
    }
    await api.deleteFolder(id)
    await refreshTree()
  }

  async function renameDoc(id: string, newTitle: string) {
    if (!api || !workspacePath.value) return
    const doc = docs.value.find((d) => d.id === id)
    if (!doc) return
    const parentDir = dirname(id)
    const newName = newTitle.endsWith('.md') ? newTitle : `${newTitle}.md`
    const newPath = parentDir === '.' ? newName : `${parentDir}/${newName}`
    await api.rename(id, newPath)
    if (activeId.value === id) {
      activeId.value = newPath
    }
    await refreshTree()
  }

  async function renameFolder(id: string, newName: string) {
    if (!api || !workspacePath.value) return
    const folder = folders.value.find((f) => f.id === id)
    if (!folder) return
    const parentDir = folder.parentId || ''
    const newPath = parentDir ? `${parentDir}/${newName}` : newName
    await api.rename(id, newPath)
    await refreshTree()
  }

  // 文件变更监听
  let unsubscribeFileWatch: (() => void) | null = null

  watch(workspacePath, (newPath, oldPath) => {
    if (oldPath && unsubscribeFileWatch) {
      unsubscribeFileWatch()
      unsubscribeFileWatch = null
    }
    if (newPath && api) {
      unsubscribeFileWatch = api.onFileChanged((event) => {
        // 简单策略：目录树有变更就全量刷新
        refreshTree().then(() => {
          // 如果当前打开的文档被外部修改且用户未编辑，刷新内容
          if (event.path === activeId.value && !dirty) {
            api.readFile(event.path).then((content) => {
              activeContent.value = content
            })
          }
        })
      })
    }
  })

  return {
    workspacePath,
    docs,
    folders,
    activeId,
    activeContent,
    searchQuery,
    filteredDocs,
    hasItems,
    treeMode,
    hasWorkspace,
    openFolder,
    refreshTree,
    setActive,
    createDoc,
    createFolder,
    deleteDoc,
    deleteFolder,
    renameDoc,
    renameFolder,
    flush,
  }
}
```

- [ ] **Step 2: 运行测试验证映射逻辑未被破坏**

Run: `npx vitest run src/composables/useLocalWorkspace.test.ts`
Expected: 5 tests PASS

- [ ] **Step 3: 提交**

```bash
git add src/composables/useLocalWorkspace.ts
git commit -m "feat: useLocalWorkspace 完整状态管理 + IPC 文件操作"
```

---

### Task 9: MarkdownEditorView 集成模式切换

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`

- [ ] **Step 1: 集成 useLocalWorkspace 和模式状态**

在 `<script setup>` 中，在 `useDocumentLibrary()` 调用之后追加：

```ts
import { useLocalWorkspace } from '@/composables/useLocalWorkspace'

const FILE_MODE_KEY = 'markdown-editor-file-mode'

function loadStoredFileMode(): 'local' | 'web' {
  try {
    const v = localStorage.getItem(FILE_MODE_KEY)
    if (v === 'local' || v === 'web') return v
  } catch {}
  return 'web'
}
function persistFileMode(mode: 'local' | 'web') {
  try { localStorage.setItem(FILE_MODE_KEY, mode) } catch {}
}

const fileMode = ref<'local' | 'web'>(loadStoredFileMode())
const isElectron = computed(() => typeof window !== 'undefined' && !!window.electronAPI)

const localWs = useLocalWorkspace()

// 根据模式选择活跃的数据源
const currentDocs = computed(() => fileMode.value === 'local' ? localWs.docs.value : docs.value)
const currentFolders = computed(() => fileMode.value === 'local' ? localWs.folders.value : folders.value)
const currentActiveId = computed(() => fileMode.value === 'local' ? localWs.activeId.value : activeId.value)
const currentHasItems = computed(() => fileMode.value === 'local' ? localWs.hasItems.value : hasLibraryItems.value)
const currentTreeMode = computed(() => fileMode.value === 'local' ? localWs.treeMode.value : treeMode.value)

function switchFileMode(next: 'local' | 'web') {
  if (next === fileMode.value) return
  // 先保存当前
  if (fileMode.value === 'web') lib.flush()
  else localWs.flush()
  fileMode.value = next
  persistFileMode(next)
}

async function onSelectLocalFolder() {
  await localWs.openFolder()
  if (localWs.hasItems.value && !localWs.activeId.value) {
    const first = localWs.docs.value[0]
    if (first) await localWs.setActive(first.id)
  }
}

// 本地模式的操作代理
async function onLocalNewDoc() {
  const folderId = localWs.activeId.value
    ? localWs.docs.value.find(d => d.id === localWs.activeId.value)?.folderId ?? null
    : null
  await localWs.createDoc(folderId)
}

async function onLocalNewFolder(parentId: string | null, title: string) {
  await localWs.createFolder(parentId, title)
}

async function onLocalDelete(id: string) {
  await localWs.deleteDoc(id)
}

async function onLocalFolderDelete(id: string) {
  await localWs.deleteFolder(id)
}

async function onLocalRename(id: string, newTitle: string) {
  await localWs.renameDoc(id, newTitle)
}

async function onLocalFolderRename(id: string, newTitle: string) {
  await localWs.renameFolder(id, newTitle)
}
```

- [ ] **Step 2: 更新模板中 DocumentLibraryPanel 的 props**

将 `DocumentLibraryPanel` 的绑定改为根据模式传入对应数据：

```html
<DocumentLibraryPanel
  ref="docLibraryPanelRef"
  v-model:search-query="searchQuery"
  :file-mode="fileMode"
  :workspace-path="localWs.workspacePath.value"
  :is-electron="isElectron"
  :folders="currentFolders"
  :docs="currentDocs"
  :tree-mode="currentTreeMode"
  :has-library-items="currentHasItems"
  :active-id="currentActiveId"
  :download-active-disabled="!currentActiveId"
  @update:file-mode="switchFileMode"
  @select-local-folder="onSelectLocalFolder"
  @select="(id) => fileMode === 'local' ? localWs.setActive(id) : onSelect(id)"
  @rename="(id, t) => fileMode === 'local' ? onLocalRename(id, t) : onRename(id, t)"
  @unlock-title="onUnlock"
  @delete="(id) => fileMode === 'local' ? onLocalDelete(id) : onDelete(id)"
  @duplicate="onDuplicate"
  @download="downloadDocAsMd"
  @download-active="downloadActiveDocAsMd"
  @new-doc="fileMode === 'local' ? onLocalNewDoc() : onNewDoc()"
  @new-folder="(pid, t) => fileMode === 'local' ? onLocalNewFolder(pid, t) : onNewFolder(pid, t)"
  @new-doc-in-folder="onNewDocInFolder"
  @folder-rename="(id, t) => fileMode === 'local' ? onLocalFolderRename(id, t) : onFolderRename(id, t)"
  @folder-delete="(id) => fileMode === 'local' ? onLocalFolderDelete(id) : onFolderDelete(id)"
  @folder-download-zip="onFolderDownloadZip"
  @move-doc="onMoveDoc"
  @move-folder-into="onMoveFolderInto"
  @reorder-library="onLibraryReorder"
  @imported="onImported"
  @import-error="onImportError"
/>
```

editor 的 `v-model` 也需要根据模式绑定不同内容：

```html
<SourceEditor
  v-if="layout === 'split' || (layout === 'code' && editMode === 'raw')"
  v-model="fileMode === 'local' ? localWs.activeContent.value : activeContent"
  language="markdown"
  :editor-theme="monacoEditorTheme"
/>
```

同样 TuiEditor 也需类似修改。

- [ ] **Step 3: 提交**

```bash
git add src/views/MarkdownEditorView.vue
git commit -m "feat: MarkdownEditorView 集成本地/Web 模式切换"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动 Electron 开发模式**

Run: `npm run electron:dev`
Expected: Electron 窗口正常启动

- [ ] **Step 2: 验证 Web 模式不受影响**

- 默认应为 Web 模式
- 新建文档、编辑、预览正常
- 文档在 IndexedDB 中持久化

- [ ] **Step 3: 验证本地模式核心流程**

- 点击底部"本地"按钮
- 点击"打开文件夹"
- 选择一个包含 .md 文件的文件夹
- 文件树正确显示
- 点击文件可正常打开编辑
- 编辑内容保存到磁盘（在 Finder 中确认文件内容已更新）

- [ ] **Step 4: 验证本地模式 CRUD**

- 新建文档 → 文件系统中出现新的 .md 文件
- 新建文件夹 → 文件系统中出现新文件夹
- 右键删除文档 → 文件被删除
- 右键删除文件夹 → 文件夹被删除

- [ ] **Step 5: 验证模式切换**

- 从 Web 切到本地，数据独立
- 从本地切回 Web，Web 模式文档不变

- [ ] **Step 6: 提交（如有微调）**

```bash
git add -A
git commit -m "chore: 端到端验证后的微调"
```
