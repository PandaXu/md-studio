import MarkdownIt from 'markdown-it'
import mdMultimdTable from 'markdown-it-multimd-table'
import mdTaskLists from 'markdown-it-task-lists'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
md.use(mdMultimdTable)
md.use(mdTaskLists, { enabled: true, label: true })

const defaultValidateLink = md.validateLink.bind(md)
const SVG_DATA_URI_RE = /^data:image\/svg\+xml;base64,[a-z0-9+/=\s]+$/i
md.validateLink = (url: string) => SVG_DATA_URI_RE.test(url) || defaultValidateLink(url)

// Inject data-line attributes from token.map into block-level opening tags,
// so the preview DOM can be mapped back to source line numbers on dblclick.
const BLOCK_TAGS = [
  'paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open',
  'list_item_open', 'blockquote_open', 'code_block', 'hr',
  'table_open', 'thead_open', 'tbody_open', 'tr_open', 'th_open', 'td_open',
]
for (const tag of BLOCK_TAGS) {
  const original = md.renderer.rules[tag]
  md.renderer.rules[tag] = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.map) token.attrSet('data-line', String(token.map[0]))
    if (original) return original(tokens, idx, options, env, self)
    return self.renderToken(tokens, idx, options)
  }
}

const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.map) token.attrSet('data-line', String(token.map[0]))
  const info = (token.info || '').trim().split(/\s+/)[0] ?? ''
  if (info === 'mermaid') {
    const escaped = md.utils.escapeHtml(token.content)
    const lineAttr = token.map ? ` data-line="${token.map[0]}"` : ''
    return `<div class="mermaid-block"${lineAttr}><details class="mermaid-source-details"><summary class="mermaid-source-summary">Mermaid 源码（点击展开 / 收起）</summary><pre class="mermaid-source">${escaped}</pre></details><div class="mermaid-out"></div><div class="mermaid-error" role="alert"></div></div>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}

export function renderMarkdownToHtml(source: string): string {
  return md.render(source)
}
