import { computed, ref, watch, type Ref } from 'vue'

export type TextEditHistoryOptions = {
  /** 停止输入多久后把当前内容记入历史（毫秒） */
  debounceMs?: number
  /** 撤销栈最大深度，超出则丢弃最旧记录 */
  maxDepth?: number
}

/**
 * 对一段可编辑文本做「停顿后快照」式的撤销 / 重做栈。
 * 与 Monaco 单字符撤销独立：此处为整篇内容的版本回退。
 */
export function useTextEditHistory(text: Ref<string>, opts?: TextEditHistoryOptions) {
  const debounceMs = opts?.debounceMs ?? 400
  const maxDepth = opts?.maxDepth ?? 200

  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])

  let committed = text.value
  let applying = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function trimUndo() {
    while (undoStack.value.length > maxDepth) undoStack.value.shift()
  }

  function tryCommit() {
    if (applying) return
    if (text.value === committed) return
    undoStack.value.push(committed)
    trimUndo()
    committed = text.value
    redoStack.value = []
  }

  function scheduleCommit() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      tryCommit()
    }, debounceMs)
  }

  watch(text, () => {
    if (applying) return
    scheduleCommit()
  })

  function reset(nextCommitted: string) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    applying = true
    committed = nextCommitted
    undoStack.value = []
    redoStack.value = []
    if (text.value !== nextCommitted) text.value = nextCommitted
    queueMicrotask(() => {
      applying = false
    })
  }

  function undo() {
    if (!undoStack.value.length) return
    applying = true
    redoStack.value.push(committed)
    committed = undoStack.value.pop()!
    text.value = committed
    queueMicrotask(() => {
      applying = false
    })
  }

  function redo() {
    if (!redoStack.value.length) return
    applying = true
    undoStack.value.push(committed)
    committed = redoStack.value.pop()!
    text.value = committed
    queueMicrotask(() => {
      applying = false
    })
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  return {
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  }
}
