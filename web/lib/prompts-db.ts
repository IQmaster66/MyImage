import {
  apiCreateCategory,
  apiDeleteCategory,
  apiDeleteEntry,
  apiExportBundle,
  apiFetchCategories,
  apiFetchEntries,
  apiImportBundle,
  apiUpdateCategory,
  apiUpsertEntry,
} from "@/lib/prompt-library-api";
import { formatPromptsMarkdown } from "@/lib/prompts-md-export";
import { readLegacyIdbSnapshot } from "@/lib/prompts-idb-legacy";
import {
  getCategoryDepth,
  getDescendantIds,
  isPromptPreviewObjectKey,
  MAX_CATEGORY_DEPTH,
  normalizeCategory,
  normalizeCategoryId,
  normalizeParentId,
  ROOT_PARENT_ID,
  UNCATEGORIZED_ID,
  type PromptCategory,
  type PromptEntry,
  type PromptKind,
} from "@/lib/prompts-types";

const CHANGED = "myimage-prompts-changed";
const MIGRATED_KEY = "myimage-prompts-migrated-to-sqlite";

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

function normalizePreviewImage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s.startsWith("data:image/")) return undefined;
  return s;
}

function normalizeEntry(raw: PromptEntry): PromptEntry {
  const entry: PromptEntry = {
    ...raw,
    categoryId: normalizeCategoryId(raw.categoryId),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
  };
  const previewImage = normalizePreviewImage(entry.previewImage);
  if (previewImage) entry.previewImage = previewImage;
  else delete entry.previewImage;
  const previewKey =
    typeof entry.previewImageKey === "string" && isPromptPreviewObjectKey(entry.previewImageKey)
      ? entry.previewImageKey.trim()
      : undefined;
  if (previewKey) entry.previewImageKey = previewKey;
  else delete entry.previewImageKey;
  return entry;
}

let migrateOnce: Promise<void> | null = null;

async function ensureMigratedFromIdb(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY)) return;
  if (!migrateOnce) {
    migrateOnce = (async () => {
      const [serverEntries, legacy] = await Promise.all([
        apiFetchEntries().catch(() => [] as PromptEntry[]),
        readLegacyIdbSnapshot(),
      ]);
      const hasServerEntries = serverEntries.length > 0;
      const hasLegacy =
        legacy !== null && (legacy.entries.length > 0 || legacy.categories.length > 0);
      if (!hasServerEntries && hasLegacy && legacy) {
        await apiImportBundle({
          categories: legacy.categories,
          entries: legacy.entries.map(normalizeEntry),
          skipExistingIds: true,
        });
      }
      localStorage.setItem(MIGRATED_KEY, "1");
    })().catch((e) => {
      migrateOnce = null;
      throw e;
    });
  }
  await migrateOnce;
}

async function ensureReady(): Promise<void> {
  await ensureMigratedFromIdb();
}

export async function getAllPrompts(): Promise<PromptEntry[]> {
  await ensureReady();
  const rows = await apiFetchEntries();
  return rows.map(normalizeEntry);
}

export async function putPrompt(entry: PromptEntry): Promise<void> {
  await putPromptBatch([entry]);
}

export async function putPromptBatch(entries: PromptEntry[]): Promise<void> {
  if (!entries.length) return;
  await ensureReady();
  for (const e of entries) {
    await apiUpsertEntry(normalizeEntry(e));
  }
  dispatchChanged();
}

export async function deletePrompt(id: string): Promise<void> {
  await ensureReady();
  await apiDeleteEntry(id);
  dispatchChanged();
}

export async function getAllCategories(): Promise<PromptCategory[]> {
  await ensureReady();
  const rows = await apiFetchCategories();
  return rows.map(normalizeCategory).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"),
  );
}

export async function putCategory(cat: PromptCategory): Promise<void> {
  await ensureReady();
  await apiUpdateCategory(normalizeCategory({ ...cat, updatedAt: Date.now() }));
  dispatchChanged();
}

export async function deleteCategory(id: string): Promise<void> {
  if (!id) return;
  await ensureReady();
  await apiDeleteCategory(id);
  dispatchChanged();
}

export async function createCategory(
  name: string,
  parentId: string = ROOT_PARENT_ID,
): Promise<PromptCategory> {
  await ensureReady();
  const existing = await getAllCategories();
  const parent = normalizeParentId(parentId);
  if (parent) {
    if (!existing.some((c) => c.id === parent)) {
      throw new Error("父分类不存在");
    }
    const nextDepth = getCategoryDepth(existing, parent) + 1;
    if (nextDepth > MAX_CATEGORY_DEPTH) {
      throw new Error(`最多支持 ${MAX_CATEGORY_DEPTH} 级分类`);
    }
  }
  const cat = await apiCreateCategory(name, parent);
  dispatchChanged();
  return normalizeCategory(cat);
}

export type PromptQuery = {
  search?: string;
  kind?: PromptKind;
  tag?: string;
  favorited?: boolean;
  categoryId?: string | null;
  categoryIds?: string[];
};

export function queryPrompts(all: PromptEntry[], q: PromptQuery): PromptEntry[] {
  let rows = all.map(normalizeEntry);
  if (q.kind) rows = rows.filter((r) => r.kind === q.kind);
  if (q.favorited === true) rows = rows.filter((r) => r.favorited);
  if (q.categoryIds && q.categoryIds.length > 0) {
    const set = new Set(q.categoryIds.map(normalizeCategoryId));
    rows = rows.filter((r) => set.has(r.categoryId));
  } else if (q.categoryId !== undefined && q.categoryId !== null) {
    const cid = normalizeCategoryId(q.categoryId);
    rows = rows.filter((r) => r.categoryId === cid);
  }
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

export function countByCategory(entries: PromptEntry[]): {
  total: number;
  uncategorized: number;
  byId: Record<string, number>;
} {
  const byId: Record<string, number> = {};
  let uncategorized = 0;
  for (const e of entries) {
    const cid = normalizeCategoryId(e.categoryId);
    if (!cid) {
      uncategorized += 1;
      continue;
    }
    byId[cid] = (byId[cid] ?? 0) + 1;
  }
  return { total: entries.length, uncategorized, byId };
}

export function countByCategoryWithSubtree(
  entries: PromptEntry[],
  categories: PromptCategory[],
): {
  total: number;
  uncategorized: number;
  byId: Record<string, number>;
  byIdSubtree: Record<string, number>;
} {
  const base = countByCategory(entries);
  const byIdSubtree: Record<string, number> = {};
  for (const c of categories) {
    const ids = getDescendantIds(categories, c.id);
    byIdSubtree[c.id] = ids.reduce((s, id) => s + (base.byId[id] ?? 0), 0);
  }
  return { ...base, byIdSubtree };
}

export async function exportPromptsJson(): Promise<string> {
  await ensureReady();
  const { categories, entries } = await apiExportBundle();
  return JSON.stringify({ version: 3, categories, entries }, null, 2);
}

export async function exportPromptsMarkdown(): Promise<string> {
  await ensureReady();
  const { categories, entries } = await apiExportBundle();
  return formatPromptsMarkdown(categories, entries);
}

function parseImportedEntry(o: Record<string, unknown>, now: number): PromptEntry | null {
  const id = typeof o.id === "string" ? o.id : crypto.randomUUID();
  const title = typeof o.title === "string" ? o.title : "导入";
  const body = typeof o.body === "string" ? o.body : "";
  const kind = (["positive", "negative", "full"].includes(o.kind as string)
    ? o.kind
    : "full") as PromptEntry["kind"];
  const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string") : [];
  const favorited = Boolean(o.favorited);
  const createdAt = typeof o.createdAt === "number" ? o.createdAt : now;
  const updatedAt = typeof o.updatedAt === "number" ? o.updatedAt : now;
  const categoryId = normalizeCategoryId(o.categoryId);
  const previewImage = normalizePreviewImage(o.previewImage);
  const rawKey = typeof o.previewImageKey === "string" ? o.previewImageKey.trim() : "";
  const previewImageKey = rawKey && isPromptPreviewObjectKey(rawKey) ? rawKey : undefined;
  const entry: PromptEntry = {
    id,
    title,
    body,
    kind,
    categoryId,
    tags,
    favorited,
    createdAt,
    updatedAt,
  };
  if (previewImage) entry.previewImage = previewImage;
  if (previewImageKey) entry.previewImageKey = previewImageKey;
  return entry;
}

export async function importPromptsJson(json: string): Promise<{ added: number; skipped: number }> {
  await ensureReady();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("JSON 格式无效");
  }

  let rows: unknown[];
  let importedCats: PromptCategory[] = [];

  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    if (!Array.isArray(root.entries)) throw new Error("根节点须为数组，或含 entries 数组的对象");
    rows = root.entries;
    if (Array.isArray(root.categories)) {
      importedCats = root.categories
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
        .map((c, i) =>
          normalizeCategory({
            id: typeof c.id === "string" ? c.id : crypto.randomUUID(),
            name: typeof c.name === "string" ? c.name.trim() || "导入分类" : "导入分类",
            parentId: normalizeParentId(c.parentId ?? c.parent_id),
            sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : typeof c.sort_order === "number" ? c.sort_order : i,
            createdAt: typeof c.createdAt === "number" ? c.createdAt : typeof c.created_at === "number" ? c.created_at : Date.now(),
            updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : typeof c.updated_at === "number" ? c.updated_at : Date.now(),
          }),
        );
    }
  } else {
    throw new Error("根节点须为数组，或含 entries 数组的对象");
  }

  const now = Date.now();
  const entries: PromptEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = parseImportedEntry(row as Record<string, unknown>, now);
    if (entry) entries.push(normalizeEntry(entry));
  }

  const result = await apiImportBundle({
    categories: importedCats,
    entries,
    skipExistingIds: true,
  });
  dispatchChanged();
  return result;
}
