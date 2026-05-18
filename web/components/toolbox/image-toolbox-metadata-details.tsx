"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { SdParametersCard } from "@/components/toolbox/sd-parameters-card";
import { isLikelyAiPngKeyword } from "@/lib/image-metadata";
import type { PngTextChunkEntry } from "@/lib/png-text-chunks";
import { useCallback, useEffect, useState } from "react";

function chunkTextNeedsCollapse(text: string): boolean {
  return text.length > 960 || text.split(/\r?\n/).length > 12;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function PngTextChunksPanel({ chunks }: { chunks: PngTextChunkEntry[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => {
    if (!copyHint) return;
    const t = window.setTimeout(() => setCopyHint(null), 3200);
    return () => window.clearTimeout(t);
  }, [copyHint]);

  const onCopy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    setCopyHint(ok ? "已复制该文本块内容" : "复制失败（请检查浏览器剪贴板权限）");
  }, []);

  const aiCount = chunks.reduce((n, c) => n + (isLikelyAiPngKeyword(c.keyword) ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            PNG 文本块
          </h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            共 <span className="font-medium text-gray-700 dark:text-gray-300">{chunks.length}</span> 条
            {aiCount > 0 ? (
              <>
                ，其中{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{aiCount}</span>{" "}
                条关键字可能与 SD / AI 相关（浅绿底标识）。长内容可展开；支持逐条复制。
              </>
            ) : (
              <>。长内容可展开；支持逐条复制。</>
            )}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {chunks.map((row, i) => {
          const ai = isLikelyAiPngKeyword(row.keyword);
          const needsCollapse = chunkTextNeedsCollapse(row.text);
          const isOpen = expanded[i] ?? false;
          const showCollapsed = needsCollapse && !isOpen;

          return (
            <li
              key={`${row.keyword}-${row.chunkType}-${i}`}
              className={`overflow-hidden rounded-xl border shadow-sm ${ai ? "border-emerald-200/90 dark:border-emerald-800/60" : "border-gray-200 dark:border-gray-700"} ${ai ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "bg-white dark:bg-zinc-900/90"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {row.chunkType}
                  </span>
                  <span className="min-w-0 break-words font-medium text-sm text-gray-900 dark:text-gray-100">
                    {row.keyword}
                  </span>
                  {ai ? (
                    <span className="shrink-0 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                      AI / SD
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void onCopy(row.text)}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                >
                  复制内容
                </button>
              </div>
              <div className="relative px-3 pb-3 pt-2">
                <pre
                  className={`whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-gray-800 dark:text-gray-200 ${showCollapsed ? "max-h-36 overflow-hidden pr-1" : "max-h-[min(70vh,28rem)] overflow-auto pr-1"}`}
                >
                  {row.text}
                </pre>
                {showCollapsed ? (
                  <div
                    className={`pointer-events-none absolute bottom-0 left-3 right-3 h-10 rounded-b-lg bg-gradient-to-t to-transparent ${ai ? "from-emerald-50 dark:from-emerald-950" : "from-white dark:from-zinc-900"}`}
                    aria-hidden
                  />
                ) : null}
                {needsCollapse ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((m) => ({ ...m, [i]: !isOpen }))}
                    className="mt-2 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {isOpen ? "收起" : "展开全文"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <CopyFeedbackToast message={copyHint} />
    </div>
  );
}
export type ImageToolboxMetadataDetailsProps = {
  originalFile: File | null;
  metadataLoading: boolean;
  metadataLoaded: boolean;
  metadataError: string | null;
  readMetadata: () => void;
  sdParametersRaw: string | null;
  pngChunks: PngTextChunkEntry[];
  exifHighlights: { key: string; value: string }[];
  exifJsonPretty: string | null;
  exifRecord: Record<string, unknown> | null;
};

export function ImageToolboxMetadataDetails({
  originalFile,
  metadataLoading,
  metadataLoaded,
  metadataError,
  readMetadata,
  sdParametersRaw,
  pngChunks,
  exifHighlights,
  exifJsonPretty,
  exifRecord,
}: ImageToolboxMetadataDetailsProps) {
  return (
    <details className="rounded-lg border border-gray-100 dark:border-gray-700/80">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        元数据与 SD 参数
      </summary>
      <div className="space-y-4 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">图片元数据（相机 / AI 生成）</h2>
            <p className="mt-1 max-w-3xl text-xs text-gray-500 dark:text-gray-400">
              本地解析上传文件：PNG 的 tEXt / zTXt / iTXt（如 Stable Diffusion WebUI 的{" "}
              <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">parameters</code>）；JPEG 等的 EXIF / IPTC /
              XMP。画布导出的处理图本身不带这些字段；若选「归档」导出策略，会额外下载原始文件副本以保留完整元数据。
            </p>
          </div>
          <button
            type="button"
            disabled={!originalFile || metadataLoading}
            onClick={readMetadata}
            className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {metadataLoading ? "读取中…" : metadataLoaded ? "重新读取" : "读取元数据"}
          </button>
        </div>

        {originalFile ? (
          <dl className="grid gap-1 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="font-medium text-gray-500 dark:text-gray-500">文件名</dt>
            <dd className="truncate font-mono text-gray-800 dark:text-gray-200">{originalFile.name}</dd>
            <dt className="font-medium text-gray-500 dark:text-gray-500">大小</dt>
            <dd>
              {(originalFile.size / 1024).toFixed(1)} KB · {originalFile.type || "未知 MIME"}
            </dd>
          </dl>
        ) : null}

        {metadataError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {metadataError}
          </p>
        ) : null}

        {metadataLoaded && sdParametersRaw ? <SdParametersCard raw={sdParametersRaw} /> : null}

        {pngChunks.length > 0 ? <PngTextChunksPanel chunks={pngChunks} /> : null}

        {exifHighlights.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              EXIF / XMP 摘要
            </h3>
            <ul className="space-y-3">
              {exifHighlights.map((row) => (
                <li
                  key={row.key}
                  className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-zinc-950/80"
                >
                  <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">{row.key}</p>
                  <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-gray-800 dark:text-gray-200">
                    {row.value}
                  </pre>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {exifJsonPretty && Object.keys(exifRecord ?? {}).length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              完整 EXIF / 解析结果（JSON）
            </h3>
            <pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-zinc-950 dark:text-gray-200">
              {exifJsonPretty}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
