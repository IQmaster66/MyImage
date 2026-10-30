import type { PromptCategory, PromptEntry } from "@/lib/prompts-types";

const DB_NAME = "myimage-prompts";
const STORE = "entries";
const CAT_STORE = "categories";

/** 一次性读取浏览器 IndexedDB 词库（迁移到 SQLite 用） */
export async function readLegacyIdbSnapshot(): Promise<{
  categories: PromptCategory[];
  entries: PromptEntry[];
} | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains(STORE) && !db.objectStoreNames.contains(CAT_STORE)) {
          resolve(null);
          return;
        }
        const cats: PromptCategory[] = [];
        const entries: PromptEntry[] = [];
        const tx = db.transaction(
          [STORE, CAT_STORE].filter((n) => db.objectStoreNames.contains(n)),
          "readonly",
        );
        if (db.objectStoreNames.contains(CAT_STORE)) {
          const cr = tx.objectStore(CAT_STORE).getAll();
          cr.onsuccess = () => {
            cats.push(...((cr.result as PromptCategory[]) ?? []));
          };
        }
        if (db.objectStoreNames.contains(STORE)) {
          const er = tx.objectStore(STORE).getAll();
          er.onsuccess = () => {
            entries.push(...((er.result as PromptEntry[]) ?? []));
          };
        }
        tx.oncomplete = () => resolve({ categories: cats, entries });
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    };
  });
}
