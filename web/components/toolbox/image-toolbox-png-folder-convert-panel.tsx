"use client";

import JSZip from "jszip";
import {
  convertFolderPngs,
  entriesFromWebkitFileList,
  pickFolderPngEntries,
  supportsDirectoryPicker,
  type FolderPngEntry,
} from "@/lib/png-folder-convert";
import { downloadBlob, formatBytesShort } from "@/lib/image-toolbox";
import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = {
  /** 紧凑样式（侧栏「更多」） */
  compact?: boolean;
};

export function ImageToolboxPngFolderConvertPanel({ compact = false }: Props) {
  const compatInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [entries, setEntries] = useState<FolderPngEntry[]>([]);
  const [folderLabel, setFolderLabel] = useState("");
  const [quality, setQuality] = useState(0.88);
  const [maxEdge, setMaxEdge] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
    current: string;
  } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [supportsPicker, setSupportsPicker] = useState(false);

  useEffect(() => {
    setSupportsPicker(supportsDirectoryPicker());
  }, []);

  const clearSelection = () => {
    setEntries([]);
    setFolderLabel("");
    setSummary(null);
    setErr(null);
    setProgress(null);
  };

  const pickNativeFolder = useCallback(async () => {
    setErr(null);
    setSummary(null);
    try {
      const { dirName, entries: list } = await pickFolderPngEntries();
      setEntries(list);
      setFolderLabel(dirName);
      if (!list.length) setSummary("该文件夹（含子目录）中没有 PNG 文件。");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "选择文件夹失败");
    }
  }, []);

  const onCompatFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setErr(null);
    setSummary(null);
    const next = entriesFromWebkitFileList(list);
    setEntries(next);
    const top = next[0]?.relativePath.split(/[/\\]/)[0] ?? "文件夹";
    setFolderLabel(top);
    if (!next.length) setSummary("所选内容中没有 PNG 文件。");
    if (compatInputRef.current) compatInputRef.current.value = "";
  };

  const runConvert = async () => {
    if (!entries.length || busy) return;
    setBusy(true);
    setErr(null);
    setSummary(null);
    const ac = new AbortController();
    abortRef.current = ac;

    const edgeRaw = maxEdge.trim();
    const maxEdgeN = edgeRaw ? Number(edgeRaw) : 0;

    try {
      const result = await convertFolderPngs(entries, {
        quality,
        maxEdge: Number.isFinite(maxEdgeN) && maxEdgeN > 0 ? maxEdgeN : undefined,
        signal: ac.signal,
        onProgress: (p) => {
          setProgress({ index: p.index, total: p.total, current: p.relativePath });
        },
      });

      if (result.zipParts.length) {
        const zip = new JSZip();
        for (const part of result.zipParts) {
          zip.file(part.path, part.blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `png-to-jpg-${new Date().toISOString().slice(0, 10)}.zip`);
      }

      const saved = result.inBytes - result.outBytes;
      const savedPct = result.inBytes > 0 ? Math.round((saved / result.inBytes) * 100) : 0;
      setSummary(
        [
          `完成：成功 ${result.ok}，失败 ${result.failed}。`,
          `体积 ${formatBytesShort(result.inBytes)} → ${formatBytesShort(result.outBytes)}`,
          saved > 0 ? `（约省 ${formatBytesShort(saved)} / ${savedPct}%）` : "",
          result.zipParts.length ? "已下载 JPG 压缩包；源 PNG 未改动。" : "",
          result.errors.length
            ? `失败示例：${result.errors
                .slice(0, 3)
                .map((x) => `${x.path}（${x.message}）`)
                .join("；")}`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setSummary("已取消转换。");
      } else {
        setErr(e instanceof Error ? e.message : "转换失败");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const box = compact
    ? "rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/80"
    : "rounded-2xl border border-emerald-200/80 bg-white/90 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/80";

  return (
    <section className={box} aria-labelledby="png-folder-convert-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="png-folder-convert-title"
            className={`font-semibold text-gray-900 dark:text-gray-50 ${compact ? "text-sm" : "text-base"}`}
          >
            文件夹 PNG → JPG
          </h2>
          <p className={`mt-1 text-gray-600 dark:text-gray-400 ${compact ? "text-[11px]" : "text-sm"}`}>
            批量把 ComfyUI 等导出的 PNG 转成 JPG（去元数据），打包成 ZIP 下载。只读源文件夹，不会修改或删除原文件。
          </p>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
        {supportsPicker ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void pickNativeFolder()}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:text-sm"
          >
            选择文件夹
          </button>
        ) : null}
        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700 sm:text-sm">
          {supportsPicker ? "兼容选择…" : "选择文件夹"}
          <input
            ref={compatInputRef}
            type="file"
            className="sr-only"
            multiple
            accept="image/png,.png"
            disabled={busy}
            {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => onCompatFiles(e.target.files)}
          />
        </label>
        {entries.length ? (
          <button
            type="button"
            disabled={busy}
            onClick={clearSelection}
            className="rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800 sm:text-sm"
          >
            清除选择
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
          找到 <span className="tabular-nums font-medium">{entries.length}</span> 张 PNG
          {entries.length
            ? `（合计 ${formatBytesShort(entries.reduce((s, e) => s + e.file.size, 0))}）`
            : ""}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          JPEG 质量 {Math.round(quality * 100)}%
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={quality}
            disabled={busy}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="mt-1 w-full accent-emerald-600"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          最长边限制（可选，像素）
          <input
            type="number"
            min={256}
            step={64}
            placeholder="留空 = 保持原分辨率"
            value={maxEdge}
            disabled={busy}
            onChange={(e) => setMaxEdge(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          转换完成后自动下载 ZIP（保留相对路径结构）。源文件夹中的 PNG 不会被改动。
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !entries.length}
          onClick={() => void runConvert()}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "转换中…" : "转换并下载 ZIP"}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
          >
            取消
          </button>
        ) : null}
      </div>

      {progress ? (
        <p className="mt-2 text-xs tabular-nums text-emerald-800 dark:text-emerald-300">
          {progress.index}/{progress.total} · {progress.current}
        </p>
      ) : null}
      {summary ? (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs leading-relaxed text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
          {summary}
        </p>
      ) : null}
      {err ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}
    </section>
  );
}
