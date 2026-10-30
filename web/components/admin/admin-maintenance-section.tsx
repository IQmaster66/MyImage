"use client";

import {
  deleteOrphanObjects,
  fetchOrphanObjects,
  formatBytes,
  type OrphanObject,
} from "@/lib/admin-api";
import { useCallback, useEffect, useState } from "react";

type Props = {
  onHint: (msg: string) => void;
  onChanged: () => void;
};

export function AdminMaintenanceSection({ onHint, onChanged }: Props) {
  const [orphans, setOrphans] = useState<OrphanObject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrphanObjects();
      setOrphans(data.orphans);
      setSelected(new Set());
    } catch (e) {
      onHint(e instanceof Error ? e.message : "加载孤立对象失败");
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, [onHint]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (!orphans?.length) return;
    setSelected(new Set(orphans.map((o) => o.object_key)));
  };

  const runDelete = async (keys: string[]) => {
    if (!keys.length || busy) return;
    setBusy(true);
    try {
      const n = await deleteOrphanObjects(keys);
      onHint(`已删除 ${n} 个孤立对象`);
      onChanged();
      await load();
    } catch (e) {
      onHint(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = orphans?.reduce((s, o) => s + o.size, 0) ?? 0;

  return (
    <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">孤立 MinIO 对象</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            存在于 MinIO（characters/ 或 temp-illustrations/）但未被数据库引用的文件。删除后不可恢复。
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
        >
          {loading ? "扫描中…" : "重新扫描"}
        </button>
      </div>

      {loading && orphans === null ? (
        <p className="mt-4 text-sm text-gray-500">正在扫描 MinIO…</p>
      ) : !orphans?.length ? (
        <p className="mt-4 text-sm text-emerald-800 dark:text-emerald-300">未发现孤立对象。</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            共 {orphans.length} 个，合计 {formatBytes(totalBytes)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs dark:border-zinc-600"
            >
              全选
            </button>
            <button
              type="button"
              disabled={!selected.size || busy}
              onClick={() => void runDelete([...selected])}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              删除所选（{selected.size}）
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`确定删除全部 ${orphans.length} 个孤立对象？`)) {
                  void runDelete(orphans.map((o) => o.object_key));
                }
              }}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            >
              删除全部孤立对象
            </button>
          </div>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-lg border border-amber-200/60 bg-white/80 p-2 dark:border-amber-900/30 dark:bg-zinc-900/60">
            {orphans.map((o) => (
              <li key={o.object_key} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800/80">
                <input
                  type="checkbox"
                  checked={selected.has(o.object_key)}
                  onChange={() => toggle(o.object_key)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{o.object_key}</p>
                  <p className="text-[10px] text-gray-500">{formatBytes(o.size)}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
