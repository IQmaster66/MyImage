import type { PromptEntry, PromptKind } from "@/lib/prompts-types";

const DB_NAME = "myimage-prompts";
const DB_VERSION = 1;
const STORE = "entries";

const CHANGED = "myimage-prompts-changed";

function dispatchChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGED));
  }
}

export function subscribePromptsChanged(cb: () => void) {
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
      os.createIndex("kind", "kind", { unique: false });
      os.createIndex("favorited", "favorited", { unique: false });
      os.createIndex("updatedAt", "updatedAt", { unique: false });
      os.createIndex("tags", "tags", { unique: false, multiEntry: true });
    };
  });
}

export async function getAllPrompts(): Promise<PromptEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PromptEntry[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function putPrompt(entry: PromptEntry): Promise<void> {
  await putPromptBatch([entry]);
}

/** 单次事务写入多条，结束时只派发一次变更事件（适合批量导入） */
export async function putPromptBatch(entries: PromptEntry[]): Promise<void> {
  if (!entries.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      dispatchChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    const s = tx.objectStore(STORE);
    for (const e of entries) s.put(e);
  });
}

export async function deletePrompt(id: string): Promise<void> {
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

export type PromptQuery = {
  search?: string;
  kind?: PromptKind;
  tag?: string;
  favorited?: boolean;
};

export function queryPrompts(all: PromptEntry[], q: PromptQuery): PromptEntry[] {
  let rows = [...all];
  if (q.kind) rows = rows.filter((r) => r.kind === q.kind);
  if (q.favorited === true) rows = rows.filter((r) => r.favorited);
  const tag = q.tag;
  if (tag) rows = rows.filter((r) => r.tags.includes(tag));
  if (q.search?.trim()) {
    const s = q.search.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(s) || r.body.toLowerCase().includes(s),
    );
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows;
}

export function allTags(entries: PromptEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) for (const t of e.tags) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function exportPromptsJson(): Promise<string> {
  const all = await getAllPrompts();
  return JSON.stringify(all, null, 2);
}

export async function importPromptsJson(json: string): Promise<{ added: number; skipped: number }> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("JSON 格式无效");
  }
  if (!Array.isArray(data)) throw new Error("根节点须为数组");
  const existing = await getAllPrompts();
  const existingIds = new Set(existing.map((e) => e.id));
  let added = 0;
  let skipped = 0;
  const now = Date.now();
  const batch: PromptEntry[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") {
      skipped++;
      continue;
    }
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : crypto.randomUUID();
    if (existingIds.has(id)) {
      skipped++;
      continue;
    }
    const title = typeof o.title === "string" ? o.title : "导入";
    const body = typeof o.body === "string" ? o.body : "";
    const kind = (["positive", "negative", "full"].includes(o.kind as string)
      ? o.kind
      : "full") as PromptEntry["kind"];
    const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string") : [];
    const favorited = Boolean(o.favorited);
    const createdAt = typeof o.createdAt === "number" ? o.createdAt : now;
    const updatedAt = typeof o.updatedAt === "number" ? o.updatedAt : now;
    const entry: PromptEntry = {
      id,
      title,
      body,
      kind,
      tags,
      favorited,
      createdAt,
      updatedAt,
    };
    batch.push(entry);
    existingIds.add(id);
    added++;
  }
  await putPromptBatch(batch);
  return { added, skipped };
}
