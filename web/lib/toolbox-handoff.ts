/** 临时插画等页面 → 工具箱：通过 URL ?handoff=<uuid> + IndexedDB 传递大图。 */

const DB_NAME = "myimage-toolbox-handoff";
const DB_VERSION = 1;
const STORE = "pending";

const SS_PENDING = "myimage-toolbox-handoff-pending";
const SS_APPLIED = "myimage-toolbox-handoff-applied";

export type ToolboxHandoffPayload = {
  blob: Blob;
  mimeType: string;
  /** 不含扩展名的建议文件名 */
  suggestedBaseName: string;
};

export type ConsumedToolboxHandoff = {
  blob: Blob;
  mimeType: string;
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

function readHandoffRow(
  os: IDBObjectStore,
  id: string,
): Promise<
  | { id: string; blob: Blob; mimeType: string; suggestedBaseName: string }
  | undefined
> {
  return new Promise((resolve, reject) => {
    const req = os.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

/** 写入 IndexedDB 并记录 pending id（应对导航后 URL 被清掉 / Strict Mode 双挂载） */
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
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SS_PENDING, id);
    sessionStorage.removeItem(SS_APPLIED);
  }
  return id;
}

export function markToolboxHandoffPending(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SS_PENDING, id);
}

export function getToolboxHandoffIdFromUrlOrSession(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("handoff")?.trim();
  if (fromUrl) return fromUrl;
  return sessionStorage.getItem(SS_PENDING)?.trim() || null;
}

export function isToolboxHandoffAlreadyApplied(id: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(SS_APPLIED) === id;
}

/** 读取 handoff，不删除（避免 React Strict Mode 第一次挂载删掉、第二次读不到） */
export async function peekToolboxHandoffById(id: string): Promise<ConsumedToolboxHandoff | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await readHandoffRow(tx.objectStore(STORE), id);
  if (!row?.blob) return null;
  return {
    blob: row.blob,
    mimeType: row.mimeType,
    suggestedBaseName: row.suggestedBaseName,
  };
}

/** 同一 handoff id 只 peek 一次（Strict Mode 双挂载共享结果） */
const peekInflight = new Map<string, Promise<ConsumedToolboxHandoff | null>>();

export function peekToolboxHandoffOnce(id: string): Promise<ConsumedToolboxHandoff | null> {
  const existing = peekInflight.get(id);
  if (existing) return existing;
  const p = peekToolboxHandoffById(id);
  peekInflight.set(id, p);
  void p.finally(() => {
    peekInflight.delete(id);
  });
  return p;
}

let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

/** 延迟删除，留给 React Strict Mode 第二次挂载读取 */
export function scheduleFinalizeToolboxHandoff(id: string, delayMs = 1200): void {
  if (finalizeTimer) clearTimeout(finalizeTimer);
  finalizeTimer = setTimeout(() => {
    finalizeTimer = null;
    void finalizeToolboxHandoffById(id);
  }, delayMs);
}

/** 成功载入工具箱后删除记录并标记已应用 */
export async function finalizeToolboxHandoffById(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SS_APPLIED, id);
    sessionStorage.removeItem(SS_PENDING);
  }
}

/** @deprecated 请用 peek + finalize；保留兼容 */
export async function consumeToolboxHandoffById(id: string): Promise<ConsumedToolboxHandoff | null> {
  const data = await peekToolboxHandoffById(id);
  if (data) await finalizeToolboxHandoffById(id);
  return data;
}

export function extensionFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("avif")) return "avif";
  return "png";
}

export function sanitizeBaseFilename(s: string): string {
  const t = s.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim();
  return (t || "image").slice(0, 120);
}

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** 临时插画条目可能是 application/octet-stream，需从扩展名或 blob.type 推断 */
export function inferHandoffMimeType(mimeType: string, blob: Blob, baseName: string): string {
  const raw = (mimeType || blob.type || "").split(";")[0]?.trim().toLowerCase();
  if (raw.startsWith("image/")) return raw;
  const ext = baseName.split(".").pop()?.toLowerCase();
  if (ext && IMAGE_EXT_MIME[ext]) return IMAGE_EXT_MIME[ext];
  return "image/png";
}

export function isImageLikeHandoffFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(ext && ext in IMAGE_EXT_MIME);
}

export function handoffFileFromConsumed(data: ConsumedToolboxHandoff): File {
  const base = sanitizeBaseFilename(data.suggestedBaseName);
  const mime = inferHandoffMimeType(data.mimeType, data.blob, base);
  const ext = extensionFromMime(mime);
  return new File([data.blob], `${base}.${ext}`, { type: mime });
}
