import { getMlApiBase } from "@/lib/ml-api";
import type { PromptCategory, PromptEntry } from "@/lib/prompts-types";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

type EntryRow = {
  id: string;
  title: string;
  body: string;
  kind: string;
  category_id: string;
  tags: string[];
  favorited: boolean;
  preview_image_key: string | null;
  created_at: number;
  updated_at: number;
};

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("无效的 JSON 响应");
  }
}

function toCategory(r: CategoryRow): PromptCategory {
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id ?? "",
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toEntry(r: EntryRow): PromptEntry {
  const entry: PromptEntry = {
    id: r.id,
    title: r.title,
    body: r.body,
    kind: r.kind as PromptEntry["kind"],
    categoryId: r.category_id ?? "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    favorited: Boolean(r.favorited),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (r.preview_image_key) entry.previewImageKey = r.preview_image_key;
  return entry;
}

function categoryBody(cat: PromptCategory) {
  return {
    name: cat.name,
    parent_id: cat.parentId ?? "",
    sort_order: cat.sortOrder,
    created_at: cat.createdAt,
    updated_at: cat.updatedAt,
  };
}

function entryBody(entry: PromptEntry) {
  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    kind: entry.kind,
    category_id: entry.categoryId ?? "",
    tags: entry.tags,
    favorited: entry.favorited,
    preview_image_key: entry.previewImageKey ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export async function apiFetchCategories(): Promise<PromptCategory[]> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/categories`);
  const data = await parseJsonOrThrow(res);
  return (data as CategoryRow[]).map(toCategory);
}

export async function apiFetchEntries(): Promise<PromptEntry[]> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/entries`);
  const data = await parseJsonOrThrow(res);
  return (data as EntryRow[]).map(toEntry);
}

export async function apiCreateCategory(name: string, parentId: string): Promise<PromptCategory> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent_id: parentId }),
  });
  const data = await parseJsonOrThrow(res);
  return toCategory(data as CategoryRow);
}

export async function apiUpdateCategory(cat: PromptCategory): Promise<PromptCategory> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/categories/${encodeURIComponent(cat.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(categoryBody(cat)),
  });
  const data = await parseJsonOrThrow(res);
  return toCategory(data as CategoryRow);
}

export async function apiDeleteCategory(id: string): Promise<void> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(res);
}

export async function apiUpsertEntry(entry: PromptEntry): Promise<PromptEntry> {
  const base = getMlApiBase();
  const body = entryBody(entry);
  const res = await fetch(`${base}/prompt-library/entries/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) {
    const createRes = await fetch(`${base}/prompt-library/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await parseJsonOrThrow(createRes);
    return toEntry(data as EntryRow);
  }
  const data = await parseJsonOrThrow(res);
  return toEntry(data as EntryRow);
}

export async function apiDeleteEntry(id: string): Promise<void> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(res);
}

export async function apiImportBundle(payload: {
  categories: PromptCategory[];
  entries: PromptEntry[];
  skipExistingIds?: boolean;
}): Promise<{ added: number; skipped: number }> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 3,
      categories: payload.categories.map((c) => ({
        id: c.id,
        name: c.name,
        parent_id: c.parentId,
        sort_order: c.sortOrder,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      })),
      entries: payload.entries.map((e) => entryBody(e)),
      skip_existing_ids: payload.skipExistingIds ?? true,
    }),
  });
  const data = await parseJsonOrThrow(res);
  return data as { added: number; skipped: number };
}

export async function apiExportBundle(): Promise<{ categories: PromptCategory[]; entries: PromptEntry[] }> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/prompt-library/export`);
  const data = (await parseJsonOrThrow(res)) as {
    categories: CategoryRow[];
    entries: EntryRow[];
  };
  return {
    categories: data.categories.map(toCategory),
    entries: data.entries.map(toEntry),
  };
}
