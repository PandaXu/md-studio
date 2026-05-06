import type { MermaidConfig } from 'mermaid'

export type MermaidThemeId = 'default' | 'dark' | 'forest' | 'enterprise'

export const MERMAID_THEMES: { id: MermaidThemeId; label: string }[] = [
  { id: 'default', label: '浅色 default' },
  { id: 'dark', label: '深色 dark' },
  { id: 'forest', label: '森林 forest' },
  {
    id: 'enterprise',
    label: '运维文档风（浅蓝灰底、黑线直角）',
  },
]

const STORAGE_KEY = 'mermaid-editor-theme'

export function loadStoredTheme(): MermaidThemeId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'default' || v === 'dark' || v === 'forest' || v === 'enterprise') return v
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

/** 参考企业运维架构图：浅灰底、 pastel 蓝节点、黑字黑线、 subgraph 浅灰分区 */
const ENTERPRISE_THEME_VARIABLES: Record<string, string> = {
  darkMode: 'false',
  background: '#f2f3f5',
  fontFamily:
    '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif',

  primaryColor: '#D9E7FF',
  primaryTextColor: '#0a0a0a',
  primaryBorderColor: '#000000',

  secondaryColor: '#FFF2CC',
  secondaryTextColor: '#0a0a0a',
  secondaryBorderColor: '#000000',

  tertiaryColor: '#D9EAD3',
  tertiaryTextColor: '#0a0a0a',
  tertiaryBorderColor: '#000000',

  lineColor: '#000000',
  textColor: '#0a0a0a',

  clusterBkg: '#e6e8eb',
  clusterBorder: '#1a1a1a',
  titleColor: '#0a0a0a',

  edgeLabelBackground: '#f2f3f5',
  mainBkg: '#D9E7FF',
  nodeBorder: '#000000',
  nodeTextColor: '#0a0a0a',

  actorBkg: '#D9E7FF',
  actorBorder: '#000000',
  actorTextColor: '#0a0a0a',
  signalColor: '#000000',
  labelBoxBkgColor: '#e6e8eb',
  labelBoxBorderColor: '#000000',
  labelTextColor: '#0a0a0a',
  loopTextColor: '#0a0a0a',
  activationBorderColor: '#000000',
  activationBkg: '#D9E7FF',
  sequenceNumberColor: '#0a0a0a',
}

/** 贴近图示的直角矩形与黑色箭头/连线 */
const ENTERPRISE_THEME_CSS = `
  .node rect,
  .node circle,
  .node ellipse,
  .node polygon {
    rx: 0 !important;
    ry: 0 !important;
  }
  .flowchart-link,
  .edge-thickness-normal {
    stroke: #000000 !important;
  }
  .edgePath .path {
    stroke: #000000 !important;
  }
  .marker,
  .marker path {
    fill: #000000 !important;
    stroke: #000000 !important;
  }
`

export function mermaidInitForTheme(theme: MermaidThemeId): MermaidConfig {
  if (theme === 'enterprise') {
    return {
      startOnLoad: false,
      theme: 'base',
      look: 'classic',
      themeVariables: ENTERPRISE_THEME_VARIABLES,
      themeCSS: ENTERPRISE_THEME_CSS,
      fontFamily: ENTERPRISE_THEME_VARIABLES.fontFamily,
      securityLevel: 'strict',
      suppressErrorRendering: true,
    }
  }

  return {
    startOnLoad: false,
    theme,
    themeCSS: undefined,
    securityLevel: 'strict',
    suppressErrorRendering: true,
  }
}
