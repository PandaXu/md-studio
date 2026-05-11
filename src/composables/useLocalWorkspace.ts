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
