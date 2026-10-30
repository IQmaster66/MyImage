import { getMlApiBase } from "@/lib/ml-api";

export type StorageStats = {
  bucket: string;
  total_count: number;
  total_bytes: number;
  by_prefix: { prefix: string; count: number; bytes: number }[];
  db_referenced_count: number;
  objects?: { object_key: string; size: number }[];
};

export function storagePrefixBytes(stats: StorageStats | null, prefix: string): number {
  if (!stats?.by_prefix) return 0;
  return stats.by_prefix.find((p) => p.prefix === prefix)?.bytes ?? 0;
}

export function storagePrefixCount(stats: StorageStats | null, prefix: string): number {
  if (!stats?.by_prefix) return 0;
  return stats.by_prefix.find((p) => p.prefix === prefix)?.count ?? 0;
}

export function buildObjectSizeMap(stats: StorageStats | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of stats?.objects ?? []) {
    m.set(o.object_key, o.size);
  }
  return m;
}

export type OrphanObject = {
  object_key: string;
  size: number;
};

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("无效的 JSON 响应");
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function fetchStorageStats(): Promise<StorageStats> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/admin/storage-stats`);
  return (await parseJsonOrThrow(res)) as StorageStats;
}

export async function fetchOrphanObjects(): Promise<{ orphans: OrphanObject[]; total_bytes: number }> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/admin/orphan-objects`);
  return (await parseJsonOrThrow(res)) as { orphans: OrphanObject[]; total_bytes: number };
}

export async function deleteOrphanObjects(objectKeys: string[]): Promise<number> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/admin/orphan-objects/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object_keys: objectKeys }),
  });
  const data = (await parseJsonOrThrow(res)) as { deleted: number };
  return data.deleted;
}
