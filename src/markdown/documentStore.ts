export type Doc = {
  id: string
  title: string
  titleLocked: boolean
  content: string
  createdAt: number
  updatedAt: number
}

export type DocStore = {
  getAll(): Promise<Doc[]>
  get(id: string): Promise<Doc | undefined>
  put(doc: Doc): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

export type OpenDocStoreOptions = {
  factory?: IDBFactory
  databaseName?: string
  databaseVersion?: number
}

const DEFAULT_DB_NAME = 'md-studio'
const DEFAULT_DB_VERSION = 1
const STORE_NAME = 'documents'
const INDEX_UPDATED_AT = 'updatedAt'

function promisifyOpen(req: IDBOpenDBRequest): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(INDEX_UPDATED_AT, 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'))
  })
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function openDocStore(options?: OpenDocStoreOptions): Promise<DocStore> {
  const factory = options?.factory ?? globalThis.indexedDB
  if (!factory) throw new Error('IndexedDB is not available in this environment')
  const dbName = options?.databaseName ?? DEFAULT_DB_NAME
  const dbVersion = options?.databaseVersion ?? DEFAULT_DB_VERSION
  const db = await promisifyOpen(factory.open(dbName, dbVersion))

  function tx(mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  }

  return {
    async getAll(): Promise<Doc[]> {
      const store = tx('readonly')
      const all = await promisifyRequest(store.getAll() as IDBRequest<Doc[]>)
      return all
    },
    async get(id: string): Promise<Doc | undefined> {
      const store = tx('readonly')
      return await promisifyRequest(store.get(id) as IDBRequest<Doc | undefined>)
    },
    async put(doc: Doc): Promise<void> {
      const store = tx('readwrite')
      await promisifyRequest(store.put(doc))
    },
    async delete(id: string): Promise<void> {
      const store = tx('readwrite')
      await promisifyRequest(store.delete(id))
    },
    async count(): Promise<number> {
      const store = tx('readonly')
      return await promisifyRequest(store.count())
    },
  }
}
