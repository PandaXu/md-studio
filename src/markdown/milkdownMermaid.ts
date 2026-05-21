import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node } from '@milkdown/prose/model'
import { $prose } from '@milkdown/kit/utils'
import mermaid from 'mermaid'
import { mermaidInitForTheme, type EnterprisePreviewTone } from '@/themes'

function initMermaid(tone: EnterprisePreviewTone) {
  mermaid.initialize(mermaidInitForTheme('enterprise', { enterprisePreview: tone }))
}

export function resetMermaidTheme(tone: EnterprisePreviewTone) {
  initMermaid(tone)
}

async function renderDiagram(code: string, el: HTMLElement) {
  try {
    await mermaid.parse(code)
    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const { svg } = await mermaid.render(id, code)
    el.innerHTML = svg
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    el.innerHTML = `<div class="mermaid-pv-err">${msg}</div>`
  }
}

function createWidget(code: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'milkdown-mermaid-widget'

  const header = document.createElement('div')
  header.className = 'mermaid-tb'
  header.textContent = 'mermaid'
  container.appendChild(header)

  const pv = document.createElement('div')
  pv.className = 'mermaid-pv'
  container.appendChild(pv)

  if (code.trim()) {
    renderDiagram(code, pv)
  } else {
    pv.innerHTML = '<div class="mermaid-pv-empty">Empty diagram</div>'
  }

  return container
}

function updateDiagramContent(widget: HTMLElement, code: string) {
  const prev = (widget as any)._mmdCode
  if (code === prev) return
  ;(widget as any)._mmdCode = code

  if ((widget as any)._mmdTimer) clearTimeout((widget as any)._mmdTimer)
  ;(widget as any)._mmdTimer = setTimeout(() => {
    const pv = widget.querySelector('.mermaid-pv') as HTMLElement | null
    if (!pv) return
    if (code.trim()) {
      renderDiagram(code, pv)
    } else {
      pv.innerHTML = '<div class="mermaid-pv-empty">Empty diagram</div>'
    }
  }, 250)
}

export function createMermaidPlugin(tone: EnterprisePreviewTone = 'light') {
  initMermaid(tone)

  return $prose(() => {
    const key = new PluginKey('milkdown-mermaid')

    return new Plugin({
      key,
      state: {
        init() {
          return DecorationSet.empty
        },
        apply(tr, set, _oldState, newState) {
          const mapped = set.map(tr.mapping, tr.doc)
          if (!tr.docChanged) return mapped

          // Collect mermaid code block positions
          const blocks = new Map<number, string>()
          newState.doc.descendants((node: Node, pos: number) => {
            if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
              blocks.set(pos, node.textContent)
            }
          })

          const covered = new Set<number>()
          const toRemove: Decoration[] = []

          for (const d of mapped.find()) {
            const $pos = newState.doc.resolve(d.from)
            let found = false
            for (let depth = $pos.depth; depth >= 0; depth--) {
              if ($pos.node(depth).type.name === 'code_block') {
                const bp = $pos.before(depth)
                if (blocks.has(bp)) { covered.add(bp); found = true }
                break
              }
            }
            if (!found) toRemove.push(d)
          }

          let next = mapped
          if (toRemove.length > 0) next = next.remove(toRemove)

          const add: Decoration[] = []
          for (const [pos, code] of blocks) {
            if (!covered.has(pos)) {
              add.push(Decoration.widget(pos + 1, () => createWidget(code), { side: -1 }))
            }
          }
          if (add.length > 0) next = next.add(newState.doc, add)

          return next
        },
      },
      props: {
        decorations(state) {
          return key.getState(state)
        },
      },
      view(editorView) {
        // Collect all widgets once and match them to code blocks efficiently
        function syncAll() {
          if (!editorView?.state) return
          const widgets = editorView.dom.querySelectorAll<HTMLElement>('.milkdown-mermaid-widget')
          if (widgets.length === 0) return

          for (const w of widgets) {
            // Widget is at pos+1 with side:-1 → it's directly before the first char.
            // Use nextSibling to find the text node, then posAtDOM on that text node.
            const next = w.nextSibling
            if (!next) continue
            try {
              const pos = editorView.posAtDOM(next, 0)
              const resolved = editorView.state.doc.resolve(pos)
              let block: Node | null = null
              for (let d = resolved.depth; d >= 0; d--) {
                if (resolved.node(d).type.name === 'code_block') {
                  block = resolved.node(d)
                  break
                }
              }
              if (block?.attrs.language === 'mermaid') {
                updateDiagramContent(w, block.textContent)
              }
            } catch { /* ignore detached nodes */ }
          }
        }

        requestAnimationFrame(() => syncAll())

        return {
          update(_view, prevState) {
            if (_view.state.doc !== prevState.doc) {
              requestAnimationFrame(() => syncAll())
            }
          },
        }
      },
    })
  })
}
