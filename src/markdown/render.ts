import MarkdownIt from 'markdown-it'
import mdMultimdTable from 'markdown-it-multimd-table'
import mdTaskLists from 'markdown-it-task-lists'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
md.use(mdMultimdTable)
md.use(mdTaskLists, { enabled: true, label: true })

const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = (token.info || '').trim().split(/\s+/)[0] ?? ''
  if (info === 'mermaid') {
    const escaped = md.utils.escapeHtml(token.content)
    return `<div class="mermaid-block"><pre class="mermaid-source">${escaped}</pre><div class="mermaid-out"></div><div class="mermaid-error" role="alert"></div></div>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}

export function renderMarkdownToHtml(source: string): string {
  return md.render(source)
}
