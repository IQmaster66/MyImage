"use client";

import { AdminMinioThumb } from "@/components/admin/admin-minio-thumb";
import { findTempIllustrationDuplicateGroups } from "@/lib/admin-duplicates";
import { deleteTempIllustration } from "@/lib/temp-illustration-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";
import { useMemo } from "react";

type Props = {
  items: TempIllustrationEntry[];
  onHint: (msg: string) => void;
  onChanged: () => void;
};

export function AdminDuplicatesSection({ items, onHint, onChanged }: Props) {
  const groups = useMemo(() => findTempIllustrationDuplicateGroups(items), [items]);

  const removeOne = async (id: string) => {
    try {
      await deleteTempIllustration(id);
      onHint("已删除重复项");
      onChanged();
    } catch (e) {
      onHint(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-500 dark:border-zinc-700">
        未发现重复的临时插画（按文件内容哈希判断）。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 dark:text-gray-400">
        共 {groups.length} 组重复，涉及 {groups.reduce((s, g) => s + g.entries.length, 0)} 条记录。建议每组保留一条，删除其余副本。
      </p>
      {groups.map((group) => (
        <section
          key={group.contentSha256}
          className="rounded-xl border border-violet-200/80 bg-violet-50/30 p-4 dark:border-violet-900/40 dark:bg-violet-950/20"
        >
          <p className="font-mono text-[10px] text-violet-800 dark:text-violet-300">
            SHA256: {group.contentSha256.slice(0, 16)}… · {group.entries.length} 条
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map((entry, idx) => (
              <li
                key={entry.id}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="relative aspect-video bg-gray-100 dark:bg-zinc-950">
                  <AdminMinioThumb imageKey={entry.imageKey} alt={entry.title} />
                  {idx === 0 ? (
                    <span className="absolute left-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      建议保留
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2 p-2">
                  <p className="line-clamp-1 text-sm font-medium">{entry.title || "未命名"}</p>
                  <p className="text-[10px] text-gray-500">{new Date(entry.createdAt).toLocaleString("zh-CN")}</p>
                  {idx > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`删除重复项「${entry.title || entry.id}」？`)) void removeOne(entry.id);
                      }}
                      className="w-full rounded-md border border-red-200 bg-red-50 py-1 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                    >
                      删除此副本
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
