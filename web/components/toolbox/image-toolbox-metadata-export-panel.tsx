"use client";

import {
  downloadBlob,
  EXPORT_FORMAT_CHOICES,
  exportFormatUsesQuality,
  extensionForMime,
  reencodeImageWithoutMetadata,
  type ExportFormat,
} from "@/lib/image-toolbox";
import { useCallback, useState } from "react";

type Props = {
  originalFile: File | null;
  baseName: string;
  /** 是否已检测到元数据（用于提示） */
  hasDetectedMetadata?: boolean;
};

export function ImageToolboxMetadataExportPanel({
  originalFile,
  baseName,
  hasDetectedMetadata = false,
}: Props) {
  const [stripMetadata, setStripMetadata] = useState(true);
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!originalFile) return;
    setBusy(true);
    setError(null);
    try {
      if (!stripMetadata) {
        downloadBlob(originalFile, originalFile.name);
        return;
      }
      const blob = await reencodeImageWithoutMetadata(originalFile, format, quality);
      const ext = extensionForMime(format);
      downloadBlob(blob, `${baseName}-no-meta.${ext}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }, [originalFile, stripMetadata, format, quality, baseName]);

  return (
    <details open className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        元数据导出
      </summary>
      <div className="space-y-4 border-t border-emerald-200/60 px-2 pb-3 pt-3 dark:border-emerald-900/40">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          专门用于处理图片元数据：勾选「去除元数据」时经画布重编码，清除 EXIF、PNG 文本块（含 SD parameters）等；不勾选则直接下载原始文件（完整保留元数据）。
          {hasDetectedMetadata ? (
            <span className="mt-1 block text-amber-800 dark:text-amber-300">
              当前图片已检测到元数据，可勾选去除后导出。
            </span>
          ) : null}
        </p>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={stripMetadata}
            onChange={(e) => setStripMetadata(e.target.checked)}
            className="mt-0.5 rounded border-gray-400 text-green-600"
          />
          <span>
            <span className="font-medium">去除图片元数据</span>
            <span className="mt-0.5 block text-[11px] font-normal text-gray-500 dark:text-gray-400">
              经浏览器画布重编码，仅保留像素，不含 EXIF / PNG tEXt 等
            </span>
          </span>
        </label>

        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          导出格式
          <select
            value={stripMetadata ? format : "original"}
            disabled={!stripMetadata}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {!stripMetadata ? <option value="original">保持原格式（{originalFile?.type || "未知"}）</option> : null}
            {EXPORT_FORMAT_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {stripMetadata && exportFormatUsesQuality(format) ? (
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            质量 {(quality * 100).toFixed(0)}%
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.02}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="mt-2 w-full accent-green-600"
            />
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!originalFile || busy}
          onClick={() => void handleExport()}
          className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "处理中…" : stripMetadata ? "导出（无元数据）" : "下载原文件"}
        </button>
      </div>
    </details>
  );
}
