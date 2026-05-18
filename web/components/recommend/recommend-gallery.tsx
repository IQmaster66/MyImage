"use client";

import { ExportPreviewLightbox } from "@/components/toolbox/export-preview-lightbox";
import { useCharacterEntries } from "@/hooks/use-character-entries";
import { useTempIllustrationEntries } from "@/hooks/use-temp-illustration-entries";
import { characterHasImage, type CharacterEntry } from "@/lib/character-types";
import { fetchMinioReadUrl } from "@/lib/ml-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-db";
import { useEffect, useMemo, useState } from "react";

type UnifiedItem =
  | { kind: "temp"; sortAt: number; key: string; temp: TempIllustrationEntry }
  | { kind: "character"; sortAt: number; key: string; character: CharacterEntry };

function buildUnified(
  temp: TempIllustrationEntry[],
  characters: CharacterEntry[],
): UnifiedItem[] {
  const rows: UnifiedItem[] = [];
  for (const t of temp) {
    rows.push({ kind: "temp", sortAt: t.createdAt, key: `temp-${t.id}`, temp: t });
  }
  for (const c of characters) {
    if (!characterHasImage(c)) continue;
    rows.push({
      kind: "character",
      sortAt: c.updatedAt,
      key: `char-${c.id}`,
      character: c,
    });
  }
  rows.sort((a, b) => b.sortAt - a.sortAt);
  return rows;
}

/** 限制极大竖图占满屏过高；横图仍按列宽缩放 */
const IMAGE_MAX_H = "min(85vh,56rem)";

function BlobThumb({
  entry,
  onOpen,
}: {
  entry: TempIllustrationEntry;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset before binding new blob / dimensions */
    let cancelled = false;
    setDims(null);
    const u = URL.createObjectURL(entry.blob);
    setUrl(u);
    /* eslint-enable react-hooks/set-state-in-effect */
    const im = new Image();
    im.onload = () => {
      if (!cancelled) setDims({ w: im.naturalWidth, h: im.naturalHeight });
    };
    im.onerror = () => {
      if (!cancelled) setDims({ w: 3, h: 4 });
    };
    im.src = u;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(u);
    };
  }, [entry.blob, entry.id]);

  const label = entry.title?.trim() || "临时插画";
  const ready = Boolean(url && dims);

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => url && onOpen(url)}
      aria-label={`放大查看：${label}`}
      className="group w-full overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 text-left shadow-sm transition hover:ring-2 hover:ring-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:ring-emerald-600/50"
    >
      {!url ? (
        <div className="flex min-h-[10rem] items-center justify-center text-xs text-gray-400">…</div>
      ) : !dims ? (
        <div className="flex min-h-[10rem] items-center justify-center text-xs text-gray-400">载入中…</div>
      ) : (
        <img
          src={url}
          width={dims.w}
          height={dims.h}
          alt={label}
          loading="lazy"
          decoding="async"
          className="mx-auto block h-auto w-full max-w-full cursor-zoom-in object-contain"
          style={{ maxHeight: IMAGE_MAX_H }}
        />
      )}
    </button>
  );
}

/** 多列瀑布流用：先拉取可读 URL，再预读尺寸，避免进栏后再长高导致整页重平衡 */
function CharacterColumnThumb({
  entry,
  busy,
  onOpen,
}: {
  entry: CharacterEntry;
  busy: boolean;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset before loading new key */
    setDims(null);
    setUrl(null);
    setFailed(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    void fetchMinioReadUrl(entry.imageKey)
      .then((u) => {
        if (cancelled) return;
        setUrl(u);
        const im = new Image();
        im.onload = () => {
          if (!cancelled) setDims({ w: im.naturalWidth, h: im.naturalHeight });
        };
        im.onerror = () => {
          if (!cancelled) setDims({ w: 3, h: 4 });
        };
        im.src = u;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.imageKey]);

  const label = entry.name?.trim() || "人物配图";
  const ready = Boolean(url && dims);

  if (failed) {
    return (
      <div className="flex min-h-[10rem] w-full flex-col items-center justify-center rounded-xl border border-gray-200/90 bg-gray-100 px-2 text-center text-[11px] leading-snug text-gray-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
        无法加载图片
        <span className="mt-1 text-[10px] opacity-80">请检查 ML API 与 MinIO</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!ready || busy}
      onClick={() => void onOpen()}
      aria-label={`放大查看：${label}`}
      className="relative w-full overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 text-left shadow-sm transition hover:ring-2 hover:ring-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:ring-emerald-600/50"
    >
      {!url ? (
        <div className="flex min-h-[10rem] items-center justify-center text-xs text-gray-400">加载中…</div>
      ) : !dims ? (
        <div className="flex min-h-[10rem] items-center justify-center text-xs text-gray-400">载入中…</div>
      ) : (
        <img
          src={url}
          width={dims.w}
          height={dims.h}
          alt={label}
          loading="lazy"
          decoding="async"
          className="mx-auto block !h-auto w-full max-w-full cursor-zoom-in object-contain"
          style={{ maxHeight: IMAGE_MAX_H }}
        />
      )}
      {busy ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 text-xs font-medium text-white">
          加载大图…
        </span>
      ) : null}
    </button>
  );
}

export function RecommendGallery() {
  const {
    items: tempItems,
    ready: tempReady,
    error: tempError,
  } = useTempIllustrationEntries();
  const {
    items: charItems,
    ready: charReady,
    error: charError,
  } = useCharacterEntries();

  const unified = useMemo(
    () => buildUnified(tempItems, charItems),
    [tempItems, charItems],
  );

  const allReady = tempReady && charReady;

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxBusyKey, setLightboxBusyKey] = useState<string | null>(null);
  const [lightboxErr, setLightboxErr] = useState<string | null>(null);

  const openLightbox = (url: string) => {
    setLightboxErr(null);
    setLightboxUrl(url);
  };

  const closeLightbox = () => setLightboxUrl(null);

  const openCharacterLightbox = async (key: string, entry: CharacterEntry) => {
    setLightboxErr(null);
    setLightboxBusyKey(key);
    try {
      const url = await fetchMinioReadUrl(entry.imageKey);
      openLightbox(url);
    } catch (e) {
      setLightboxErr(e instanceof Error ? e.message : "无法加载大图");
    } finally {
      setLightboxBusyKey(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-emerald-50/80 via-white/90 to-zinc-50/90 dark:from-emerald-950/35 dark:via-zinc-950/80 dark:to-zinc-950">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 rounded-2xl border border-emerald-200/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm dark:border-emerald-900/45 dark:bg-zinc-900/85 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
              推荐
            </h1>
            {allReady ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                {unified.length} 张图片
              </span>
            ) : null}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            汇集本机临时插画与人物百科中的配图，按原始比例完整显示（不裁切）；点击缩略图可放大浏览。不展示 SD 参数与提示词正文。
          </p>
        </header>

        {lightboxErr ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {lightboxErr}
          </p>
        ) : null}

        {tempError || charError ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {tempError ? <p>临时插画：{tempError}</p> : null}
            {charError ? <p className={tempError ? "mt-1" : ""}>人物百科：{charError}</p> : null}
          </div>
        ) : null}

        {!allReady ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-24 dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">加载图片列表…</p>
          </div>
        ) : unified.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/70 bg-white/80 px-6 py-20 text-center dark:border-emerald-800/60 dark:bg-zinc-900/60">
            <p className="max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              暂无图片。可在「临时插画」保存生成图，或在「人物百科」添加带图人物后回到此处浏览。
            </p>
          </div>
        ) : (
          <ul className="columns-2 gap-x-4 sm:columns-3 md:columns-4 lg:columns-5 [column-gap:1.25rem]">
            {unified.map((item) => (
              <li key={item.key} className="mb-5 break-inside-avoid">
                {item.kind === "temp" ? (
                  <BlobThumb entry={item.temp} onOpen={openLightbox} />
                ) : (
                  <CharacterColumnThumb
                    entry={item.character}
                    busy={lightboxBusyKey === item.key}
                    onOpen={() => void openCharacterLightbox(item.key, item.character)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {lightboxUrl ? (
          <ExportPreviewLightbox url={lightboxUrl} onClose={closeLightbox} />
        ) : null}
      </main>
    </div>
  );
}
