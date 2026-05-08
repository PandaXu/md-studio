import { isDocRecord, type Doc, type DocStore } from './documentStore'
import { deriveTitle, nextUntitledOrdinal } from './documentTitle'

const LEGACY_SOURCE_KEY = 'markdown-editor-source'

export type MigrationDeps = {
  store: DocStore
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  defaultSampleContent: string
  now?: () => number
  uuid?: () => string
}

function defaultUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function createDocFromContent(
  store: DocStore,
  opts: { title: string; titleLocked: boolean; content: string; now: () => number; uuid: () => string },
): Promise<Doc> {
  const ts = opts.now()
  const doc: Doc = {
    id: opts.uuid(),
    title: opts.title,
    titleLocked: opts.titleLocked,
    content: opts.content,
    createdAt: ts,
    updatedAt: ts,
  }
  await store.put(doc)
  return doc
}

export async function runMigrationIfNeeded(deps: MigrationDeps): Promise<string> {
  const now = deps.now ?? (() => Date.now())
  const uuid = deps.uuid ?? defaultUuid
  const count = await deps.store.count()
  if (count > 0) {
    const all = await deps.store.getAll()
    const docsOnly = all.filter(isDocRecord)
    const sorted = [...docsOnly].sort((a, b) => b.updatedAt - a.updatedAt)
    return sorted[0]?.id ?? ''
  }

  let legacy: string | null = null
  try {
    legacy = deps.storage.getItem(LEGACY_SOURCE_KEY)
  } catch {
    legacy = null
  }

  if (legacy && legacy.trim().length > 0) {
    const ordinal = nextUntitledOrdinal([])
    const title = deriveTitle(legacy, ordinal)
    const doc = await createDocFromContent(deps.store, {
      title,
      titleLocked: false,
      content: legacy,
      now,
      uuid,
    })
    try {
      deps.storage.removeItem(LEGACY_SOURCE_KEY)
    } catch {
      /* ignore */
    }
    return doc.id
  }

  const doc = await createDocFromContent(deps.store, {
    title: '示例文章',
    titleLocked: false,
    content: deps.defaultSampleContent,
    now,
    uuid,
  })
  return doc.id
}
