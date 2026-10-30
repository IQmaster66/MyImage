import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";

export type DuplicateGroup = {
  contentSha256: string;
  entries: TempIllustrationEntry[];
};

/** 按文件哈希分组，仅保留出现 2 次及以上的临时插画。 */
export function findTempIllustrationDuplicateGroups(items: TempIllustrationEntry[]): DuplicateGroup[] {
  const map = new Map<string, TempIllustrationEntry[]>();
  for (const e of items) {
    const hash = e.contentSha256?.trim().toLowerCase();
    if (!hash) continue;
    const list = map.get(hash) ?? [];
    list.push(e);
    map.set(hash, list);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([contentSha256, entries]) => ({
      contentSha256,
      entries: entries.sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
}
