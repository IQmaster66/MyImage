/** 临时插画等页面 → 工具箱：通过 URL ?handoff=<uuid> + IndexedDB 传递大图，避免 sessionStorage 无法存 Blob、且规避 Strict Mode 双跑竞态。 */

const DB_NAME = "myimage-toolbox-handoff";
const DB_VERSION = 1;
const STORE = "pending";

export type ToolboxHandoffPayload = {
  blob: Blob;
  mimeType: string;
  /** 不含扩展名的建议文件名 */
  suggestedBaseName: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function queueToolboxHandoff(input: ToolboxHandoffPayload): Promise<string> {
  const id = crypto.randomUUID();
  const db = await openDb();
  const row = {
    id,
    blob: input.blob,
    mimeType: input.mimeType,
    suggestedBaseName: input.suggestedBaseName,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
}

export type ConsumedToolboxHandoff = {
  blob: Blob;
  mimeType: string;
  suggestedBaseName: string;
};

/** 读取并删除对应记录；不存在则返回 null */
export async function consumeToolboxHandoffById(id: string): Promise<ConsumedToolboxHandoff | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const req = os.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as
        | { id: string; blob: Blob; mimeType: string; suggestedBaseName: string }
        | undefined;
      if (!row?.blob) {
        resolve(null);
        return;
      }
      os.delete(id);
      resolve({
        blob: row.blob,
        mimeType: row.mimeType,
        suggestedBaseName: row.suggestedBaseName,
      });
    };
  });
}

export function extensionFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  return "png";
}

export function sanitizeBaseFilename(s: string): string {
  const t = s.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim();
  return (t || "image").slice(0, 120);
}

export function handoffFileFromConsumed(data: ConsumedToolboxHandoff): File {
  const base = sanitizeBaseFilename(data.suggestedBaseName);
  const ext = extensionFromMime(data.mimeType);
  return new File([data.blob], `${base}.${ext}`, { type: data.mimeType });
}
