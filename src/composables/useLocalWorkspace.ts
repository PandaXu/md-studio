import type { Doc, FolderRecord } from '@/markdown/documentStore'
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
// FileNode 类型在 env.d.ts 中全局声明，此处直接使用

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

// ============================================================
// 完整 composable：状态管理 + IPC 文件操作 + 文件监听
// ============================================================

export type LocalWorkspaceHandle = {
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
      unsubscribeFileWatch = api.onFileChanged((_event) => {
        refreshTree().then(() => {
          if (activeId.value && !dirty && docs.value.some((d) => d.id === activeId.value)) {
            api.readFile(joinPath(workspacePath.value!, activeId.value)).then((content) => {
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
