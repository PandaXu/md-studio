# 本地文件模式设计

## 概述

在文件管理面板底部增加"本地模式/Web 模式"切换。本地模式下，通过 Electron IPC 直接操作本地文件系统（打开文件夹 → 文件树 → 编辑 → 保存），类似 VS Code 工作区体验。两种模式完全独立，数据隔离。

## 架构

```
MarkdownEditorView.vue
  ├── DocumentLibraryPanel.vue (复用 UI)
  │     └── FileModeSwitch.vue (新增，吸底模式切换)
  ├── useDocumentLibrary.ts   (Web 模式，IndexedDB — 不改动)
  └── useLocalWorkspace.ts    (本地模式，Electron IPC — 新增)
```

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/FileModeSwitch.vue` | 新增 | 吸底切换按钮组（本地/Web）+ 打开文件夹按钮 |
| `src/composables/useLocalWorkspace.ts` | 新增 | 本地工作区状态，通过 `window.electronAPI` 操作文件 |
| `electron/preload.js` | 新增 | contextBridge 暴露安全 IPC API |
| `electron/main.cjs` | 修改 | 添加文件系统 IPC handlers + 对话框 |
| `src/components/DocumentLibraryPanel.vue` | 修改 | 底部 slot/插入 FileModeSwitch，收本地数据 props(可选) |
| `src/views/MarkdownEditorView.vue` | 修改 | 集成 useLocalWorkspace，按模式切换数据源 |
| `vite.config.ts` | 可能修改 | 确保 preload 打包路径正确 |

## 数据流

### 本地模式

1. 切换至"本地模式" → 如未选择工作区，弹出"打开文件夹"按钮
2. 点击"打开文件夹" → IPC `dialog.showOpenDialog` → 用户选择文件夹
3. 主进程递归扫描 `*.md` 文件 → 返回 `FileNode[]`（含目录结构）
4. 文件树渲染在面板中（复用现有文件夹树 UI）
5. 用户点击文件 → IPC `readFile` → 内容传到编辑器
6. 编辑器内容变更 → 320ms 防抖 → IPC `writeFile` → 写回文件系统
7. `fs.watch` 监听文件夹内文件变更 → 通知渲染进程刷新目录树/重新读取当前文件

### Web 模式

完全保持现有逻辑不变（IndexedDB 读写）。

### 模式切换

- Electron 环境：显示两个选项，均可选
- 浏览器环境：仅显示 Web 模式（或本地模式置灰提示"需桌面应用"）
- 切换时弹出确认（当前未保存内容会先 flush）

## 类型定义

```ts
// 本地文件树节点
type FileNode = {
  name: string       // 文件名（含 .md 后缀）或目录名
  path: string       // 相对于工作区根目录的路径
  kind: 'file' | 'dir'
  children?: FileNode[]
}

// preload 暴露的 API
interface ElectronFileAPI {
  selectFolder(): Promise<string | null>           // 打开文件夹对话框，返回路径
  scanFolder(folderPath: string): Promise<FileNode[]>  // 递归扫描 md 文件
  readFile(filePath: string): Promise<string>           // 读取文件内容
  writeFile(filePath: string, content: string): Promise<void>  // 写入文件
  onFileChanged(callback: (event: { path: string; type: 'change' | 'rename' | 'delete' }) => void): () => void  // 监听文件变更，返回取消订阅函数
}
```

## IPC 通道设计

| 通道 | 方向 | 用途 |
|------|------|------|
| `dialog:select-folder` | Renderer → Main | 打开系统文件夹选择对话框 |
| `fs:scan-folder` | Renderer → Main | 扫描指定目录下的 md 文件树 |
| `fs:read-file` | Renderer → Main | 读取单个文件内容 |
| `fs:write-file` | Renderer → Main | 写入单个文件 |
| `fs:watch-start` | Renderer → Main | 开始监听文件夹变更 |
| `fs:watch-stop` | Renderer → Main | 停止监听 |
| `fs:file-changed` | Main → Renderer | 文件变更事件通知 |

## 组件设计

### FileModeSwitch.vue

- 位置：DocumentLibraryPanel 底部，flex column 中 `margin-top: auto` 吸底
- 外观：两个按钮的 segment-control 样式（本地模式 / Web 模式），加一个打开文件夹的图标按钮（仅本地模式显示）
- Props: `modelValue: 'local' | 'web'`, `workspacePath: string | null`
- Emits: `update:modelValue`, `selectFolder`

## UI 复用策略

DocumentLibraryPanel 目前接收 `docs: Doc[]` 和 `folders: FolderRecord[]` props。本地模式下，`useLocalWorkspace` 将 `FileNode[]` 转换为符合 `Doc[]`/`FolderRecord[]` 接口的代理数组，直接传给现有面板组件。转换逻辑：

- `FileNode.kind === 'dir'` → 映射为 `FolderRecord`（生成临时 id = 路径）
- `FileNode.kind === 'file'` → 映射为 `Doc`（id = 路径，title = 文件名去 .md，content 惰性加载）
- 面板的"新建文档"等按钮在本地模式下隐藏（通过新增 prop `readonly: boolean` 控制）

## 本地模式下的操作清单

| 操作 | 支持 | 说明 |
|------|------|------|
| 浏览文件树 | ✅ | 复用现有文件夹树 UI |
| 打开/编辑文件 | ✅ | 点击 → IPC 读取 → 编辑器；编辑 → 防抖 → IPC 写回 |
| 搜索文件 | ✅ | 复用现有搜索框 |
| 新建文件/文件夹 | ❌ | 本地模式暂不提供，用户可在 Finder 中操作 |
| 删除文件 | ❌ | 同上 |
| 拖拽排序 | ❌ | 文件系统顺序由系统决定 |
| 导入/导出 | ❌ | 文件已在本地，无需导入导出 |

## 关键细节

- `window.electronAPI` 是否存在的检测作为"是否在 Electron 中运行"的判断依据
- 浏览器环境下本地模式按钮置灰并显示 tooltip"需在 MD Studio 桌面应用中启用"
- 扫描文件时排除 `node_modules`、`.git`、隐藏文件/文件夹（`.` 开头）
- 文件内容读取/写入均使用 UTF-8
- 外部文件变更（fs.watch）：检测到变更后，若用户未编辑该文件则静默刷新内容；若用户已编辑则弹 toast 提示"文件已被外部修改"
- 模式切换时：先 flush 当前模式的数据（Web 模式保存到 IndexedDB，本地模式写回文件），再切换

## 不变更范围

- Web 模式所有逻辑（useDocumentLibrary、documentStore、IndexedDB）
- Mermaid 编辑器
- AppModeNav 组件
- 路由结构
- 样式主题系统
