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
  actorLineColor: '#000000',
  signalColor: '#000000',
  signalTextColor: '#0a0a0a',
  labelBoxBkgColor: '#e6e8eb',
  labelBoxBorderColor: '#000000',
  labelTextColor: '#0a0a0a',
  loopTextColor: '#0a0a0a',
  activationBorderColor: '#000000',
  activationBkgColor: '#D9E7FF',
  sequenceNumberColor: '#0a0a0a',
  noteBkgColor: '#FFF2CC',
  noteBorderColor: '#000000',
  noteTextColor: '#0a0a0a',
  labelBkg: '#D9E7FF',
  arrowheadColor: '#000000',
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

/** 深色预览：背景偏暗，连线/箭头统一为灰色 */
const ENTERPRISE_GRAY_STROKE = '#94a3b8'

const ENTERPRISE_THEME_VARIABLES_DARK: Record<string, string> = {
  darkMode: 'true',
  background: '#0f1419',
  fontFamily: ENTERPRISE_THEME_VARIABLES.fontFamily,

  primaryColor: '#1e293b',
  primaryTextColor: '#e5e7eb',
  primaryBorderColor: ENTERPRISE_GRAY_STROKE,

  secondaryColor: '#334155',
  secondaryTextColor: '#e5e7eb',
  secondaryBorderColor: ENTERPRISE_GRAY_STROKE,

  tertiaryColor: '#1e3a2f',
  tertiaryTextColor: '#e5e7eb',
  tertiaryBorderColor: ENTERPRISE_GRAY_STROKE,

  lineColor: ENTERPRISE_GRAY_STROKE,
  textColor: '#e5e7eb',

  clusterBkg: '#1f2937',
  clusterBorder: ENTERPRISE_GRAY_STROKE,
  titleColor: '#e5e7eb',

  edgeLabelBackground: '#0f1419',
  mainBkg: '#1e293b',
  nodeBorder: ENTERPRISE_GRAY_STROKE,
  nodeTextColor: '#e5e7eb',

  actorBkg: '#1e293b',
  actorBorder: ENTERPRISE_GRAY_STROKE,
  actorTextColor: '#e5e7eb',
  actorLineColor: ENTERPRISE_GRAY_STROKE,
  signalColor: ENTERPRISE_GRAY_STROKE,
  signalTextColor: '#e5e7eb',
  labelBoxBkgColor: '#1f2937',
  labelBoxBorderColor: ENTERPRISE_GRAY_STROKE,
  labelTextColor: '#e5e7eb',
  loopTextColor: '#e5e7eb',
  activationBorderColor: ENTERPRISE_GRAY_STROKE,
  activationBkgColor: '#1e293b',
  sequenceNumberColor: '#e5e7eb',
  noteBkgColor: '#334155',
  noteBorderColor: ENTERPRISE_GRAY_STROKE,
  noteTextColor: '#e5e7eb',
  labelBkg: '#1e293b',
  arrowheadColor: ENTERPRISE_GRAY_STROKE,
}

const ENTERPRISE_THEME_CSS_DARK = `
  .node rect,
  .node circle,
  .node ellipse,
  .node polygon {
    rx: 0 !important;
    ry: 0 !important;
  }
  .flowchart-link,
  .edge-thickness-normal {
    stroke: ${ENTERPRISE_GRAY_STROKE} !important;
  }
  .edgePath .path {
    stroke: ${ENTERPRISE_GRAY_STROKE} !important;
  }
  .marker,
  .marker path {
    fill: ${ENTERPRISE_GRAY_STROKE} !important;
    stroke: ${ENTERPRISE_GRAY_STROKE} !important;
  }
`

export type EnterprisePreviewTone = 'light' | 'dark'

export function mermaidInitForTheme(
  theme: MermaidThemeId,
  opts?: { enterprisePreview?: EnterprisePreviewTone },
): MermaidConfig {
  if (theme === 'enterprise') {
    const tone = opts?.enterprisePreview ?? 'light'
    if (tone === 'dark') {
      return {
        startOnLoad: false,
        theme: 'base',
        look: 'classic',
        themeVariables: ENTERPRISE_THEME_VARIABLES_DARK,
        themeCSS: ENTERPRISE_THEME_CSS_DARK,
        fontFamily: ENTERPRISE_THEME_VARIABLES.fontFamily,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      }
    }
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
