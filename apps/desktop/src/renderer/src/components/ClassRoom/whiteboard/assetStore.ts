/** F3.3 本地素材收藏：IndexedDB 持久化后端 + 可注入内存后端（测试/降级） */

export interface FavoriteAsset {
  id: string;
  name: string;
  /** 图片 dataURL（本地导入即持久化，跨版本可迁移） */
  dataUrl: string;
  createdAt: number;
}

/** 存储后端抽象：默认 IndexedDB，测试注入内存实现（jsdom 无原生 IndexedDB） */
export interface AssetBackend {
  put(a: FavoriteAsset): Promise<void>;
  getAll(): Promise<FavoriteAsset[]>;
  get(id: string): Promise<FavoriteAsset | null>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'yunyan-whiteboard-assets';
const STORE = 'favorites';

function idbBackend(): AssetBackend {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return {
    async put(a) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(a);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    },
    async getAll() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const list = (req.result as FavoriteAsset[]) || [];
          resolve([...list].sort((a, b) => b.createdAt - a.createdAt));
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    },
    async get(id) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as FavoriteAsset) ?? null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    },
    async delete(id) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    }
  };
}

/** 内存后端：测试与 IndexedDB 不可用时的降级（会话内有效，不跨版本） */
export function createMemoryAssetBackend(): AssetBackend {
  const map = new Map<string, FavoriteAsset>();
  return {
    async put(a) {
      map.set(a.id, a);
    },
    async getAll() {
      return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return map.get(id) ?? null;
    },
    async delete(id) {
      map.delete(id);
    }
  };
}

let backend: AssetBackend | null = null;
let forceMemory = false;

function getBackend(): AssetBackend {
  if (!backend) backend = forceMemory ? createMemoryAssetBackend() : idbBackend();
  return backend;
}

/** 注入后端（测试用）；传 null 恢复默认 */
export function setAssetBackend(b: AssetBackend | null): void {
  backend = b;
  forceMemory = false;
}

/** IndexedDB 不可用时降级为内存后端（不持久化，仅会话内） */
export function useMemoryAssetBackend(): void {
  backend = createMemoryAssetBackend();
  forceMemory = true;
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `asset-${Date.now().toString(36)}-${seq}`;
}

export async function addFavorite(name: string, dataUrl: string): Promise<FavoriteAsset> {
  const a: FavoriteAsset = { id: newId(), name, dataUrl, createdAt: Date.now() };
  await getBackend().put(a);
  return a;
}

export async function listFavorites(): Promise<FavoriteAsset[]> {
  return getBackend().getAll();
}

export async function getFavorite(id: string): Promise<FavoriteAsset | null> {
  return getBackend().get(id);
}

export async function removeFavorite(id: string): Promise<void> {
  return getBackend().delete(id);
}
