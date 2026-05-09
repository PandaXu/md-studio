export type Doc = {
  id: string
  /** 所在文件夹 id；缺省或 null 表示根目录 */
  folderId?: string | null
  title: string
  titleLocked: boolean
  content: string
  createdAt: number
  updatedAt: number
  /** 同级排序序号，越小越靠前；缺省时由迁移或新建逻辑补齐 */
  sortIndex?: number
}

export type FolderRecord = {
  id: string
  kind: 'folder'
  title: string
  /** 父文件夹 id；null 表示根目录下的一级文件夹 */
  parentId: string | null
  createdAt: number
  updatedAt: number
  sortIndex?: number
}

export type StoredItem = Doc | FolderRecord

export function isFolderRecord(item: StoredItem): item is FolderRecord {
  return (item as FolderRecord).kind === 'folder'
}

export function isDocRecord(item: StoredItem): item is Doc {
  return !isFolderRecord(item)
}

export type DocStore = {
  getAll(): Promise<StoredItem[]>
  get(id: string): Promise<StoredItem | undefined>
  put(item: StoredItem): Promise<void>
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
    async getAll(): Promise<StoredItem[]> {
      const store = tx('readonly')
      const all = await promisifyRequest(store.getAll() as IDBRequest<StoredItem[]>)
      return all
    },
    async get(id: string): Promise<StoredItem | undefined> {
      const store = tx('readonly')
      return await promisifyRequest(store.get(id) as IDBRequest<StoredItem | undefined>)
    },
    async put(item: StoredItem): Promise<void> {
      const store = tx('readwrite')
      await promisifyRequest(store.put(item))
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
