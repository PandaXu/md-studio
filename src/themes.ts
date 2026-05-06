import type { MermaidConfig } from 'mermaid'

export type MermaidThemeId = 'default' | 'dark' | 'forest'

export const MERMAID_THEMES: { id: MermaidThemeId; label: string }[] = [
  { id: 'default', label: '浅色 default' },
  { id: 'dark', label: '深色 dark' },
  { id: 'forest', label: '森林 forest' },
]

const STORAGE_KEY = 'mermaid-editor-theme'

export function loadStoredTheme(): MermaidThemeId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'default' || v === 'dark' || v === 'forest') return v
  } catch {
    /* ignore */
  }
  return null
}

export function persistTheme(id: MermaidThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function mermaidInitForTheme(theme: MermaidThemeId): MermaidConfig {
  return {
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    suppressErrorRendering: true,
  }
}
