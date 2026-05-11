import { onBeforeUnmount, type Ref } from 'vue'

/**
 * 在左右并列编辑 / 预览之间同步滚动位置。
 *
 * @param sourceEl  编辑区可滚动 DOM 元素（Monaco 编辑器根容器）
 * @param targetEl  预览区可滚动 DOM 元素（.preview-scroll）
 * @param active    Ref<boolean> — 仅当为 true 时才执行同步，用于布局切换时暂停
 */
export function useScrollSync(
  sourceEl: Ref<HTMLElement | null>,
  targetEl: Ref<HTMLElement | null>,
  active: Ref<boolean>,
) {
  let syncing = false

  function sync(source: HTMLElement, target: HTMLElement) {
    if (syncing) return
    const maxScroll = source.scrollHeight - source.clientHeight
    if (maxScroll <= 0) return
    const ratio = source.scrollTop / maxScroll
    const targetMax = target.scrollHeight - target.clientHeight
    syncing = true
    target.scrollTop = ratio * targetMax
    requestAnimationFrame(() => {
      syncing = false
    })
  }

  function onSourceScroll(ev: Event) {
    if (!active.value || !targetEl.value) return
    sync(ev.target as HTMLElement, targetEl.value)
  }

  function onTargetScroll(ev: Event) {
    if (!active.value || !sourceEl.value) return
    sync(ev.target as HTMLElement, sourceEl.value)
  }

  function connect() {
    const s = sourceEl.value
    const t = targetEl.value
    if (!s || !t) return
    const monacoScrollable = s.querySelector('.monaco-scrollable-element') as HTMLElement | null
    if (monacoScrollable) {
      attachedMonacoEl = monacoScrollable
      monacoScrollable.addEventListener('scroll', onSourceScroll, { passive: true })
    } else {
      requestAnimationFrame(() => {
        const retry = s.querySelector('.monaco-scrollable-element') as HTMLElement | null
        if (retry) {
          attachedMonacoEl = retry
          retry.addEventListener('scroll', onSourceScroll, { passive: true })
        }
      })
    }
    t.addEventListener('scroll', onTargetScroll, { passive: true })
  }

  let attachedMonacoEl: HTMLElement | null = null

  function disconnect() {
    const t = targetEl.value
    if (attachedMonacoEl) {
      attachedMonacoEl.removeEventListener('scroll', onSourceScroll)
      attachedMonacoEl = null
    }
    // 也清理可能通过首次查找直接附加的
    const s = sourceEl.value
    if (s) {
      const mc = s.querySelector('.monaco-scrollable-element') as HTMLElement | null
      mc?.removeEventListener('scroll', onSourceScroll)
    }
    t?.removeEventListener('scroll', onTargetScroll)
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
