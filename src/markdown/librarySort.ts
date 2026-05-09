import type { Doc, FolderRecord } from '@/markdown/documentStore'

export function validFolderIdSet(folders: readonly FolderRecord[]): Set<string> {
  return new Set(folders.map((f) => f.id))
}

/** 文档在树中的有效父文件夹 id（悬空 folderId 视为根） */
export function effectiveDocParentId(doc: Doc, validIds: Set<string>): string | null {
  const fid = doc.folderId ?? null
  if (!fid || !validIds.has(fid)) return null
  return fid
}

const MISSING_SORT = 1e15

export function siblingSortKey(item: Doc | FolderRecord): number {
  return item.sortIndex ?? MISSING_SORT
}

/** 同级排序：sortIndex 升序；缺失时按 updatedAt 降序；稳定 tie-break：id */
export function compareLibrarySiblings(a: Doc | FolderRecord, b: Doc | FolderRecord): number {
  const ai = siblingSortKey(a)
  const bi = siblingSortKey(b)
  if (ai !== bi) return ai - bi
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
  return a.id.localeCompare(b.id)
}

export function needsSortIndexMigration(
  docs: readonly Doc[],
  folders: readonly FolderRecord[],
): boolean {
  return docs.some((d) => d.sortIndex === undefined) || folders.some((f) => f.sortIndex === undefined)
}

/**
 * 为缺省 sortIndex 的数据分配顺序：保持原视觉规则（同级内文件夹在前、按 updatedAt 降序，再文档按 updatedAt 降序）。
 */
export function migrateSortIndices(docs: Doc[], folders: FolderRecord[]): {
  docs: Doc[]
  folders: FolderRecord[]
} {
  const validIds = validFolderIdSet(folders)
  const eff = (d: Doc) => effectiveDocParentId(d, validIds)
  const parentKeys = new Set<string | null>([null])
  for (const f of folders) parentKeys.add(f.id)

  const nextDocs = docs.map((d) => ({ ...d }))
  const nextFolders = folders.map((f) => ({ ...f }))
  const docById = new Map(nextDocs.map((d) => [d.id, d]))
  const folderById = new Map(nextFolders.map((f) => [f.id, f]))

  for (const p of parentKeys) {
    const fs = nextFolders.filter((f) => f.parentId === p).sort((a, b) => b.updatedAt - a.updatedAt)
    const ds = nextDocs.filter((d) => eff(d) === p).sort((a, b) => b.updatedAt - a.updatedAt)
    let i = 0
    for (const f of fs) {
      const nf = folderById.get(f.id)
      if (nf) nf.sortIndex = i++
    }
    for (const d of ds) {
      const nd = docById.get(d.id)
      if (nd) nd.sortIndex = i++
    }
  }

  return { docs: nextDocs, folders: nextFolders }
}

export function maxSortIndexInParent(
  parentId: string | null,
  docs: readonly Doc[],
  folders: readonly FolderRecord[],
): number {
  const validIds = validFolderIdSet(folders)
  const eff = (d: Doc) => effectiveDocParentId(d, validIds)
  let m = -1
  for (const f of folders) {
    if (f.parentId !== parentId) continue
    const si = f.sortIndex ?? 0
    if (si > m) m = si
  }
  for (const d of docs) {
    if (eff(d) !== parentId) continue
    const si = d.sortIndex ?? 0
    if (si > m) m = si
  }
  return m
}
