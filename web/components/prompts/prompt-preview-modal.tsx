"use client";

import { useDialogFocusTrap } from "@/hooks/use-dialog-focus-trap";
import { resolvePromptPreviewSrc } from "@/lib/prompt-preview-image";
import { entryHasPromptPreview, PROMPT_KIND_LABELS, type PromptEntry } from "@/lib/prompts-types";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  entry: PromptEntry | null;
  onClose: () => void;
};

export function PromptPreviewModal({ open, entry, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDialogFocusTrap(open, panelRef, {
    onEscape: onClose,
    lockBodyScroll: open,
  });

  useEffect(() => {
    if (!open || !entry) {
      setImageSrc(null);
      setLoading(false);
      return;
    }
    if (!entryHasPromptPreview(entry)) {
      setImageSrc(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setImageSrc(null);
    void resolvePromptPreviewSrc(entry).then((u) => {
      if (!cancelled) {
        setImageSrc(u);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, entry?.id, entry?.previewImageKey, entry?.previewImage]);

  if (!open || !entry) return null;

  const hasImage = entryHasPromptPreview(entry);

  if (!hasImage) {
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-preview-empty-title"
      >
        <button type="button" className="absolute inset-0 bg-black/45" aria-label="关闭" onClick={onClose} />
        <div className="relative z-[201] w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-zinc-900">
          <h2 id="prompt-preview-empty-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {entry.title}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            暂无效果图。可在「编辑」中导入参考图。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm text-gray-800 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`效果预览：${entry.title}`}
    >
      <div
        role="presentation"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute left-4 top-4 z-[202] max-w-[min(70vw,24rem)] rounded-lg bg-black/50 px-3 py-2 text-white backdrop-blur-sm">
        <p className="truncate text-sm font-medium">{entry.title}</p>
        <p className="text-[11px] text-white/75">{PROMPT_KIND_LABELS[entry.kind]}</p>
      </div>
      <button
        type="button"
        className="absolute right-3 top-3 z-[202] rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-900 shadow-md hover:bg-white dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
        onClick={onClose}
      >
        关闭
      </button>
      {loading ? (
        <p className="relative z-[201] text-sm text-white/90">加载中…</p>
      ) : imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={`${entry.title} 效果图`}
          tabIndex={-1}
          onClick={onClose}
          className="relative z-[201] max-h-[min(92dvh,92vw)] max-w-full cursor-zoom-out rounded-lg border border-white/20 object-contain shadow-2xl"
        />
      ) : (
        <p className="relative z-[201] max-w-md rounded-lg bg-black/60 px-4 py-3 text-center text-sm text-white">
          效果图加载失败，请确认 ML API 与 MinIO 已启动。
        </p>
      )}
    </div>
  );
}
