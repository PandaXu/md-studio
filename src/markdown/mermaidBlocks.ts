import mermaid from 'mermaid'
import type { EnterprisePreviewTone, MermaidThemeId } from '@/themes'
import { mermaidInitForTheme } from '@/themes'

export async function renderMermaidBlocksIn(
  root: HTMLElement,
  chartTheme: MermaidThemeId,
  renderSeq: number,
  getCurrentSeq: () => number,
  opts?: { enterprisePreview?: EnterprisePreviewTone },
): Promise<void> {
  mermaid.initialize(mermaidInitForTheme(chartTheme, opts))
  const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block')
  for (const block of blocks) {
    if (getCurrentSeq() !== renderSeq) return
    const pre = block.querySelector('pre.mermaid-source')
    const out = block.querySelector<HTMLElement>('.mermaid-out')
    const errEl = block.querySelector<HTMLElement>('.mermaid-error')
    const code = pre?.textContent?.trim() ?? ''
    if (!out || !errEl) continue
    errEl.textContent = ''
    out.innerHTML = ''
    if (!code) continue
    try {
      await mermaid.parse(code)
      if (getCurrentSeq() !== renderSeq) return
      const id = `mmd-md-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const { svg } = await mermaid.render(id, code)
      if (getCurrentSeq() !== renderSeq) return
      out.innerHTML = svg
    } catch (e) {
      if (getCurrentSeq() !== renderSeq) return
      const msg = e instanceof Error ? e.message : String(e)
      errEl.textContent = msg
      out.innerHTML = ''
    }
  }
}
