/**
 * 解析目录上传时 File.webkitRelativePath（含所选根文件夹名），仅 .md。
 * folderSegments 为从所选根目录到文件所在目录的路径（第一段即本地所选文件夹名），
 * 便于在库中创建同名根文件夹并保留其下子目录结构。
 */
export function parseMdEntryFromWebkitPath(webkitPath: string): {
  folderSegments: string[]
  title: string
} | null {
  const norm = webkitPath.replace(/\\/g, '/').trim()
  const parts = norm.split('/').filter((p) => p.length > 0)
  if (!parts.length) return null
  const fileName = parts[parts.length - 1]
  if (!fileName.toLowerCase().endsWith('.md')) return null
  const title = fileName.replace(/\.md$/i, '').trim() || '未命名'

  if (parts.length === 1) {
    return { folderSegments: [], title }
  }

  const dirParts = parts
    .slice(0, -1)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')

  return { folderSegments: dirParts, title }
}
