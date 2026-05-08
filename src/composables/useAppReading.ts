import { ref, watch, type Ref } from 'vue'

/** 全站浅色 / 深色（正文、Mermaid 预览、Monaco、Toast UI 等共用） */
export type AppReadingMode = 'light' | 'dark'

const STORAGE_KEY = 'md-studio-reading'

/** 迁移旧键，避免升级后丢失用户选择 */
const LEGACY_READING_KEYS = ['markdown-editor-reading', 'mermaid-editor-preview-reading'] as const

function readStoredReading(): AppReadingMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
    for (const k of LEGACY_READING_KEYS) {
      const old = localStorage.getItem(k)
      if (old === 'light' || old === 'dark') {
        localStorage.setItem(STORAGE_KEY, old)
        return old
      }
    }
  } catch {
    /* ignore */
  }
  return 'light'
}

function persistReading(mode: AppReadingMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

function applyReadingToDocument(mode: AppReadingMode) {
  document.documentElement.setAttribute('data-reading', mode)
}

const appReading = ref<AppReadingMode>(readStoredReading())

watch(
  appReading,
  (mode) => {
    applyReadingToDocument(mode)
    persistReading(mode)
  },
  { immediate: true },
)

export function useAppReading(): {
  reading: Ref<AppReadingMode>
  setReading: (next: AppReadingMode) => void
} {
  return {
    reading: appReading,
    setReading(next: AppReadingMode) {
      appReading.value = next
    },
  }
}
