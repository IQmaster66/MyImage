"use client";

import { fetchMinioReadUrl } from "@/lib/ml-api";
import type { CharacterEntry } from "@/lib/character-types";
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

type Props = {
  entry: CharacterEntry;
  className?: string;
  /** 仅作用于成功加载后的图片元素（如推荐页限制最大高度） */
  imgStyle?: CSSProperties;
  /**
   * 悬停蒙版：复制带服装 / 不带服装提示词。
   * 开启后点击复制按钮会 stopPropagation，避免误开编辑。
   */
  enablePromptCopyOverlay?: boolean;
  onCopyFeedback?: (message: string) => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CharacterCoverImage({
  entry,
  className,
  imgStyle,
  enablePromptCopyOverlay = false,
  onCopyFeedback,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    void fetchMinioReadUrl(entry.imageKey)
      .then((u) => {
        if (!cancelled) setSrc(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.imageKey]);

  const clothed = entry.promptClothed.trim();
  const unclothed = entry.promptUnclothed.trim();

  const onCopy = async (e: MouseEvent, kind: "clothed" | "unclothed") => {
    e.preventDefault();
    e.stopPropagation();
    const text = kind === "clothed" ? clothed : unclothed;
    const label = kind === "clothed" ? "带服装" : "不带服装";
    if (!text) {
      onCopyFeedback?.(`${label}提示词为空`);
      return;
    }
    const ok = await copyText(text);
    onCopyFeedback?.(ok ? `已复制${label}提示词` : "复制失败");
  };

  if (failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gray-200 text-center text-[11px] text-gray-500 dark:bg-zinc-800 dark:text-gray-400 ${className ?? ""}`}
      >
        无法加载图片
        <br />
        请检查 ML API 与 MinIO
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400 dark:bg-zinc-900 ${className ?? ""}`}
      >
        加载中…
      </div>
    );
  }

  return (
    <div
      className={`group/cover relative h-full w-full ${enablePromptCopyOverlay ? "pointer-events-none" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={entry.name.trim() || "未命名"}
        decoding="async"
        loading="lazy"
        className={className ?? "pointer-events-none h-full w-full object-cover"}
        style={imgStyle}
      />
      {enablePromptCopyOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/55 px-2 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100 group-hover/cover:opacity-100"
          role="group"
          aria-label="复制提示词"
        >
          <p className="text-[10px] font-medium tracking-wide text-white/80">复制提示词</p>
          <button
            type="button"
            disabled={!clothed}
            title={clothed ? "复制带服装提示词" : "带服装提示词为空"}
            onClick={(e) => void onCopy(e, "clothed")}
            className="pointer-events-auto w-full max-w-[9.5rem] rounded-lg border border-white/25 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100"
          >
            带服装
          </button>
          <button
            type="button"
            disabled={!unclothed}
            title={unclothed ? "复制不带服装提示词" : "不带服装提示词为空"}
            onClick={(e) => void onCopy(e, "unclothed")}
            className="pointer-events-auto w-full max-w-[9.5rem] rounded-lg border border-white/25 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-sky-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100"
          >
            不带服装
          </button>
        </div>
      ) : null}
    </div>
  );
}
