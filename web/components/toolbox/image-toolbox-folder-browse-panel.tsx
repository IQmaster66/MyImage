"use client";

import { FolderBrowsePermissionDialog } from "@/components/toolbox/folder-browse-permission-dialog";
import type { FolderImageBrowseApi } from "@/hooks/use-folder-image-browse";
import { formatBytesShort } from "@/lib/image-toolbox";
import { useRef, useState, type InputHTMLAttributes } from "react";

type Props = {
  browse: FolderImageBrowseApi;
  /** 紧凑样式（侧栏「更多」） */
  compact?: boolean;
};

/** 操作面板：当前图由工具箱左侧主预览区展示，此处不嵌套缩略图。 */
export function ImageToolboxFolderBrowsePanel({ browse, compact = false }: Props) {
  const compatInputRef = useRef<HTMLInputElement>(null);
  const [permOpen, setPermOpen] = useState(false);
  const [permBusy, setPermBusy] = useState(false);
  const {
    entries,
    kept,
    current,
    index,
    folderLabel,
    removedCount,
    keptBytes,
    sortMode,
    setSortBy,
    setSortDir,
    metaHydrating,
    metaProgress,
    dateSortReady,
    busy,
    supportsPicker,
    clearSelection,
    pickNativeFolder,
    onCompatFiles,
    goPrev,
    goNext,
    softRemoveCurrent,
    undoAllRemoved,
    exportRemaining,
  } = browse;

  const openCompatPicker = () => {
    setPermOpen(false);
    compatInputRef.current?.click();
  };

  const confirmNativePick = async () => {
    setPermBusy(true);
    try {
      await pickNativeFolder();
    } finally {
      setPermBusy(false);
      setPermOpen(false);
    }
  };

  const box = compact
    ? "rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80"
    : "rounded-2xl border border-emerald-200/80 bg-white/90 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/80";

  return (
    <section className={box} aria-labelledby="folder-browse-title">
      <FolderBrowsePermissionDialog
        open={permOpen}
        busy={permBusy}
        onCancel={() => !permBusy && setPermOpen(false)}
        onConfirmNative={() => void confirmNativePick()}
        onUseCompat={openCompatPicker}
      />

      <div className="min-w-0">
        <h2
          id="folder-browse-title"
          className={`font-semibold text-gray-900 dark:text-gray-50 ${compact ? "text-sm" : "text-base"}`}
        >
          文件夹浏览
        </h2>
        <p className={`mt-1 text-gray-600 dark:text-gray-400 ${compact ? "text-[11px]" : "text-sm"}`}>
          选择文件夹后，当前图在左侧大预览区显示；←→ 切换，Delete
          从列表假移除（不删磁盘）。可把剩余图片导出为 ZIP。
        </p>
      </div>

      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
        {supportsPicker ? (
          <button
            type="button"
            disabled={busy || permBusy}
            onClick={() => setPermOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:text-sm"
          >
            选择文件夹
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || permBusy}
          onClick={openCompatPicker}
          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700 sm:text-sm"
        >
          {supportsPicker ? "兼容选择…" : "选择文件夹"}
        </button>
        <input
          ref={compatInputRef}
          type="file"
          className="sr-only"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp"
          disabled={busy}
          {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
          onChange={(e) => {
            onCompatFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {entries.length ? (
          <button
            type="button"
            disabled={busy}
            onClick={clearSelection}
            className="rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800 sm:text-sm"
          >
            清除
          </button>
        ) : null}
      </div>

      {folderLabel || entries.length ? (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          {folderLabel ? (
            <>
              文件夹：<span className="font-medium text-gray-800 dark:text-gray-200">{folderLabel}</span>
              {" · "}
            </>
          ) : null}
          剩余 <span className="tabular-nums font-medium">{kept.length}</span> / {entries.length}
          {removedCount ? (
            <>
              {" · "}
              已移除 <span className="tabular-nums">{removedCount}</span>
            </>
          ) : null}
          {kept.length ? ` · ${formatBytesShort(keptBytes)}` : ""}
        </p>
      ) : null}

      {entries.length ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">排序</span>
            <div
              className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-zinc-600 dark:bg-zinc-950"
              role="group"
              aria-label="排序字段"
            >
              {(
                [
                  { id: "name", label: "名称" },
                  { id: "date", label: "日期" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={sortMode.by === opt.id}
                  onClick={() => setSortBy(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    sortMode.by === opt.id
                      ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-800 dark:text-emerald-300"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div
              className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-zinc-600 dark:bg-zinc-950"
              role="group"
              aria-label="排序方向"
            >
              {(
                [
                  { id: "asc", label: "递增" },
                  { id: "desc", label: "递减" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={sortMode.dir === opt.id}
                  onClick={() => setSortDir(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    sortMode.dir === opt.id
                      ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-800 dark:text-emerald-300"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {metaHydrating && metaProgress ? (
            <p className="text-[11px] tabular-nums text-amber-800 dark:text-amber-200/90">
              后台读取修改时间 {metaProgress.done}/{metaProgress.total}
              {sortMode.by === "date" ? " · 日期排序会逐步更新" : " · 名称排序已可用"}
            </p>
          ) : null}
          {!metaHydrating && sortMode.by === "date" && !dateSortReady ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">部分文件缺少修改时间，已排在末尾附近。</p>
          ) : null}
        </div>
      ) : null}

      {current ? (
        <p
          className="mt-2 truncate text-[11px] text-gray-500 dark:text-gray-400"
          title={current.relativePath}
        >
          <span className="tabular-nums text-gray-700 dark:text-gray-300">
            {index + 1}/{kept.length}
          </span>
          {" · "}
          {current.relativePath}
        </p>
      ) : null}

      {kept.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || kept.length < 2}
            onClick={goPrev}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            上一张
          </button>
          <button
            type="button"
            disabled={busy || kept.length < 2}
            onClick={goNext}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            下一张
          </button>
          <button
            type="button"
            disabled={busy || !current}
            onClick={softRemoveCurrent}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
          >
            从列表移除
          </button>
          {removedCount ? (
            <button
              type="button"
              disabled={busy}
              onClick={undoAllRemoved}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              恢复已移除
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !kept.length}
          onClick={() => void exportRemaining()}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:text-sm"
        >
          {busy ? "打包中…" : "导出剩余为 ZIP"}
        </button>
      </div>
    </section>
  );
}
