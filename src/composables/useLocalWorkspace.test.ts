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
