const TITLE_MAX = 100
const UNTITLED_PREFIX = '未命名'
const UNTITLED_REGEX = /^未命名\s+(\d+)$/

function clipTitle(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= TITLE_MAX) return trimmed
  return `${trimmed.slice(0, TITLE_MAX - 1)}…`
}

export function deriveTitle(content: string, fallbackOrdinal: number): string {
  const m = content.match(/^[ \t]{0,3}#[ \t]+(.+?)[ \t]*$/m)
  if (m) {
    const cleaned = clipTitle(m[1])
    if (cleaned) return cleaned
  }
  return `${UNTITLED_PREFIX} ${fallbackOrdinal}`
}

export function nextUntitledOrdinal(existingTitles: readonly string[]): number {
  let max = 0
  for (const t of existingTitles) {
    const m = t.match(UNTITLED_REGEX)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return max + 1
}

export function sanitizeRenameInput(input: string, currentTitle: string): string | null {
  const cleaned = clipTitle(input)
  if (!cleaned) return null
  if (cleaned === currentTitle) return null
  return cleaned
}

export function safeFilenameFromTitle(title: string): string {
  const stripped = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
  if (!stripped) return 'markdown.md'
  const clipped = stripped.length > 80 ? stripped.slice(0, 80) : stripped
  return `${clipped}.md`
}

export function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const segments = u.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last) {
      const stripped = last.replace(/\.(md|markdown)$/i, '')
      if (stripped) {
        let decoded: string | null = null
        try {
          decoded = decodeURIComponent(stripped)
        } catch {
          /* malformed percent-encoding: leave decoded null so we fall back to hostname below */
        }
        return clipTitle(decoded ?? '') || u.hostname || 'URL 导入'
      }
    }
    return u.hostname || 'URL 导入'
  } catch {
    return 'URL 导入'
  }
}
