"use client";

import { AdminMinioThumb } from "@/components/admin/admin-minio-thumb";
import { formatBytes } from "@/lib/admin-api";
import type { AdminImageItem } from "@/lib/admin-image-types";
import { fetchMinioReadUrl } from "@/lib/ml-api";
import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  item: AdminImageItem | null;
  sizeBytes?: number | null;
  onClose: () => void;
};

export function AdminImageDetailModal({ item, sizeBytes, onClose }: Props) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setFullUrl(null);
      return;
    }
    let cancelled = false;
    void fetchMinioReadUrl(item.imageKey)
      .then((u) => {
        if (!cancelled) setFullUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFullUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const created = new Date(item.sortAt).toLocaleString("zh-CN");

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-[141] flex max-h-[min(94dvh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              {item.kind === "temp" ? "临时插画" : "人物百科"}
            </p>
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex justify-center bg-gray-100/80 p-4 dark:bg-zinc-950/80">
            {fullUrl ? (
              <img
                src={fullUrl}
                alt=""
                className="max-h-[min(36dvh,24rem)] max-w-full rounded-lg object-contain shadow-md"
              />
            ) : (
              <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg">
                <AdminMinioThumb imageKey={item.imageKey} alt={item.title} />
              </div>
            )}
          </div>
          <dl className="grid gap-3 px-4 py-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">对象键</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">
                {item.imageKey}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">时间</dt>
              <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{created}</dd>
            </div>
            {typeof sizeBytes === "number" ? (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">占用体积</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-gray-800 dark:text-gray-200">
                  {formatBytes(sizeBytes)}
                </dd>
              </div>
            ) : null}
            {item.mimeType ? (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">MIME</dt>
                <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{item.mimeType}</dd>
              </div>
            ) : null}
            {item.subtitle ? (
              <div className="sm:col-span-2">
                <dt className="text-gray-500 dark:text-gray-400">提示词</dt>
                <dd className="mt-0.5 line-clamp-4 text-gray-800 dark:text-gray-200">{item.subtitle}</dd>
              </div>
            ) : null}
          </dl>
          {item.sdRaw?.trim() ? (
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">SD 参数</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-gray-800 dark:bg-zinc-950 dark:text-gray-200">
                {item.sdRaw}
              </pre>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          {item.kind === "temp" ? (
            <Link
              href="/temp-illustration"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
            >
              打开临时插画页
            </Link>
          ) : (
            <Link
              href="/character"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
            >
              打开人物百科
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
