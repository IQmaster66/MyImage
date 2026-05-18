export type TempIllustrationEntry = {
  id: string;
  createdAt: number;
  title: string;
  mimeType: string;
  sdRaw: string | null;
  blob: Blob;
};

const DB_NAME = "myimage-temp-illustration";
const DB_VERSION = 1;
const STORE = "entries";

const CHANGED = "myimage-temp-illustration-changed";

function dispatchChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGED));
  }
}

export function subscribeTempIllustrationChanged(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) return;
      const os = db.createObjectStore(STORE, { keyPath: "id" });
      os.createIndex("createdAt", "createdAt", { unique: false });
    };
  });
}

export async function getAllTempIllustrations(): Promise<TempIllustrationEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => {
      const rows = (r.result ?? []) as TempIllustrationEntry[];
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    r.onerror = () => reject(r.error);
  });
}

function normalizeMimeType(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() || "";
}

/** 与保存逻辑一致：无有效文本时视为 null */
function normalizeSdRawForCompare(raw: string | null): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

async function arrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer): Promise<boolean> {
  if (a.byteLength !== b.byteLength) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return false;
  }
  return true;
}

async function blobsBinaryEqual(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [bufA, bufB] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  return arrayBuffersEqual(bufA, bufB);
}

/**
 * 是否存在与待保存项完全相同的记录（MIME、SD 参数字符串、图片二进制均一致）。
 */
export async function findFullDuplicateTempIllustration(params: {
  mimeType: string;
  sdRaw: string | null;
  imageBlob: Blob;
}): Promise<TempIllustrationEntry | null> {
  const targetMime = normalizeMimeType(params.mimeType);
  const targetSd = normalizeSdRawForCompare(params.sdRaw);
  const rows = await getAllTempIllustrations();
  for (const row of rows) {
    if (normalizeMimeType(row.mimeType) !== targetMime) continue;
    if (normalizeSdRawForCompare(row.sdRaw) !== targetSd) continue;
    if (!(await blobsBinaryEqual(row.blob, params.imageBlob))) continue;
    return row;
  }
  return null;
}

export async function putTempIllustration(input: {
  id: string;
  createdAt: number;
  title: string;
  mimeType: string;
  sdRaw: string | null;
  imageBlob: Blob;
}): Promise<void> {
  const db = await openDb();
  const row: TempIllustrationEntry = {
    id: input.id,
    createdAt: input.createdAt,
    title: input.title,
    mimeType: input.mimeType,
    sdRaw: input.sdRaw,
    blob: input.imageBlob,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      dispatchChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
}

export async function deleteTempIllustration(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      dispatchChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}
