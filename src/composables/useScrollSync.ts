import { onBeforeUnmount, type Ref } from 'vue'

type ScrollMeta = { scrollTop: number; scrollHeight: number; clientHeight: number }
type ScrollDispose = () => void

/**
 * 在左右并列编辑 / 预览之间同步滚动位置。
 *
 * @param sourceScrollProvider  返回 cleanup 函数，需在回调中提供编辑区滚动位置
 * @param targetEl              预览区可滚动 DOM 元素（.preview-scroll）
 * @param active                Ref<boolean> — 仅当为 true 时才执行同步
 */
export function useScrollSync(
  sourceScrollProvider: (onScroll: (meta: ScrollMeta) => void) => ScrollDispose,
  targetEl: Ref<HTMLElement | null>,
  active: Ref<boolean>,
) {
  let syncing = false
  let sourceDispose: ScrollDispose | null = null

  function syncSourceToTarget(meta: ScrollMeta) {
    if (syncing || !active.value || !targetEl.value) return
    const maxScroll = meta.scrollHeight - meta.clientHeight
    if (maxScroll <= 0) return
    const ratio = meta.scrollTop / maxScroll
    const targetMax = targetEl.value.scrollHeight - targetEl.value.clientHeight
    syncing = true
    targetEl.value.scrollTop = ratio * targetMax
    requestAnimationFrame(() => {
      syncing = false
    })
  }

  function onTargetScroll(ev: Event) {
    if (syncing || !active.value) return
    const el = ev.target as HTMLElement
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return
    const ratio = el.scrollTop / maxScroll
    // 通过 sourceScrollProvider 无法反向驱动，使用 DOM 方式设置
    // 但 source 不是 DOM — 这里只能由 Monaco API 反向设置
    // 先通过 document 查找并设置 scrollTop
    const monacoEl = document.querySelector('.monaco-scrollable-element') as HTMLElement | null
    if (monacoEl) {
      const sourceMax = monacoEl.scrollHeight - monacoEl.clientHeight
      syncing = true
      monacoEl.scrollTop = ratio * sourceMax
      requestAnimationFrame(() => {
        syncing = false
      })
    }
  }

  function connect() {
    const t = targetEl.value
    if (!t) return
    // 源（Monaco）→ 预览：通过回调驱动
    sourceDispose = sourceScrollProvider(syncSourceToTarget)
    // 预览 → 源（Monaco）：DOM scroll 事件
    t.addEventListener('scroll', onTargetScroll, { passive: true })
  }

  function disconnect() {
    sourceDispose?.()
    sourceDispose = null
    targetEl.value?.removeEventListener('scroll', onTargetScroll)
  }

  function reconnect() {
    disconnect()
    connect()
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    connect,
    disconnect,
    reconnect,
  }
}
