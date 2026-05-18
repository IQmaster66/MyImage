"use client";

import { fetchMinioReadUrl } from "@/lib/ml-api";
import type { CharacterEntry } from "@/lib/character-types";
import { useEffect, useState, type CSSProperties } from "react";

type Props = {
  entry: CharacterEntry;
  className?: string;
  /** 仅作用于成功加载后的图片元素（如推荐页限制最大高度） */
  imgStyle?: CSSProperties;
};

export function CharacterCoverImage({ entry, className, imgStyle }: Props) {
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
    <img
      src={src}
      alt={entry.name}
      decoding="async"
      loading="lazy"
      className={className ?? "h-full w-full object-cover"}
      style={imgStyle}
    />
  );
}
