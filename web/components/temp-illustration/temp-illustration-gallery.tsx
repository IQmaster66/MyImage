"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { TempIllustrationDetailModal } from "@/components/temp-illustration/temp-illustration-detail-modal";
import { TempIllustrationRemoveConfirmDialog } from "@/components/temp-illustration/temp-illustration-remove-confirm";
import { useTempIllustrationEntries } from "@/hooks/use-temp-illustration-entries";
import {
  buildAndDownloadZip,
  tempIllustrationZipParts,
  zipFilenameWithDate,
} from "@/lib/gallery-zip-export";
import { queueToolboxHandoff } from "@/lib/toolbox-handoff";
import { deleteTempIllustration, fetchTempIllustrationBlob } from "@/lib/temp-illustration-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";
import { fetchMinioReadUrl } from "@/lib/ml-api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

function Thumb({
  entry,
  onOpen,
  sendingHandoff,
  onSendToToolbox,
}: {
  entry: TempIllustrationEntry;
  onOpen: () => void;
  sendingHandoff: boolean;
  onSendToToolbox: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const hasSd = Boolean(entry.sdRaw?.trim());

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    void fetchMinioReadUrl(entry.imageKey)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.imageKey, entry.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 shadow-sm outline-none transition hover:border-emerald-400/90 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-emerald-600"
    >
      {url ? (
        <img src={url} alt="" className="pointer-events-none h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-gray-400">…</div>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 text-left">
        <span className="line-clamp-2 text-[11px] font-medium text-white">{entry.title || "未命名"}</span>
      </span>
      {hasSd ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
          查看生成参数
        </span>
      ) : (
        <button
          type="button"
          disabled={sendingHandoff}
          onClick={(e) => {
            e.stopPropagation();
            onSendToToolbox();
          }}
          className="absolute right-1.5 top-1.5 z-20 rounded-md bg-emerald-700/95 px-2 py-1 text-[10px] font-semibold text-white shadow-md ring-1 ring-white/30 hover:bg-emerald-600 disabled:opacity-60"
          title="发送到工具箱进行 BLIP / WD 反推"
        >
          {sendingHandoff ? "…" : "反推"}
        </button>
      )}
    </div>
  );
}

export function TempIllustrationGallery() {
  const router = useRouter();
  const { items, ready, error, refresh } = useTempIllustrationEntries();
  const [selected, setSelected] = useState<TempIllustrationEntry | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TempIllustrationEntry | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const exportHintClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [handoffSendingId, setHandoffSendingId] = useState<string | null>(null);

  const askRemove = (e: TempIllustrationEntry, ev: MouseEvent) => {
    ev.stopPropagation();
    setPendingRemove(e);
  };

  const runRemoveFromGrid = async () => {
    if (!pendingRemove) return;
    setRemoveBusy(true);
    try {
      await deleteTempIllustration(pendingRemove.id);
      if (selected?.id === pendingRemove.id) setSelected(null);
      setPendingRemove(null);
      void refresh();
    } finally {
      setRemoveBusy(false);
    }
  };

  const flashExportHint = (msg: string) => {
    if (exportHintClearRef.current) clearTimeout(exportHintClearRef.current);
    setExportHint(msg);
    exportHintClearRef.current = setTimeout(() => {
      setExportHint(null);
      exportHintClearRef.current = null;
    }, 4500);
  };

  const runExportAllZip = async () => {
    if (!items.length || exportBusy) return;
    setExportBusy(true);
    setExportHint(null);
    try {
      const parts = await tempIllustrationZipParts(items);
      await buildAndDownloadZip(parts, zipFilenameWithDate("临时插画导出"));
      flashExportHint(`已打包下载 ${items.length} 张图片`);
    } catch (e) {
      setExportHint(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (exportHintClearRef.current) clearTimeout(exportHintClearRef.current);
    };
  }, []);

  const sendEntryToToolbox = async (entry: TempIllustrationEntry) => {
    if (handoffSendingId) return;
    setHandoffSendingId(entry.id);
    setExportHint(null);
    try {
      const blob = await fetchTempIllustrationBlob(entry);
      const hid = await queueToolboxHandoff({
        blob,
        mimeType: entry.mimeType,
        suggestedBaseName: entry.title || "temp-illustration",
      });
      router.push(`/toolbox?handoff=${encodeURIComponent(hid)}`);
    } catch (e) {
      setExportHint(e instanceof Error ? e.message : "发送到工具箱失败");
    } finally {
      setHandoffSendingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <CopyFeedbackToast message={exportHint} />

        {!ready ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">加载列表中…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-8 text-center dark:border-red-900/40 dark:bg-red-950/30">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
            <p className="mt-2 text-xs text-red-700/90 dark:text-red-300/90">请确认 ML API 与 MinIO 已启动。</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/70 bg-white/80 px-6 py-16 text-center dark:border-emerald-800/60 dark:bg-zinc-900/60">
            <p className="max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              暂无条目。请到工具箱上传图片，并点击「存到临时插画」。
            </p>
            <Link
              href="/toolbox"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
            >
              打开工具箱
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/toolbox"
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-gray-100 dark:hover:border-emerald-700"
              >
                工具箱
              </Link>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => void runExportAllZip()}
                className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportBusy ? "打包中…" : `导出 ZIP（${items.length}）`}
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
              {items.map((entry) => (
                <li key={entry.id} className="relative">
                  <Thumb
                    entry={entry}
                    onOpen={() => setSelected(entry)}
                    sendingHandoff={handoffSendingId === entry.id}
                    onSendToToolbox={() => void sendEntryToToolbox(entry)}
                  />
                  <button
                    type="button"
                    onClick={(ev) => askRemove(entry, ev)}
                    className="absolute top-1.5 left-1.5 z-20 rounded-md bg-red-600/95 px-2 py-1 text-[10px] font-semibold text-white shadow-sm ring-1 ring-white/25 hover:bg-red-700"
                    title="移除"
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <TempIllustrationDetailModal
        entry={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => void refresh()}
      />

      <TempIllustrationRemoveConfirmDialog
        open={pendingRemove !== null}
        name={pendingRemove?.title ?? ""}
        busy={removeBusy}
        onCancel={() => setPendingRemove(null)}
        onConfirm={runRemoveFromGrid}
      />
    </div>
  );
}
