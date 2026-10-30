"use client";

import { useDialogFocusTrap } from "@/hooks/use-dialog-focus-trap";
import { useRef } from "react";

type Props = {
  url: string;
  onClose: () => void;
  /** 无障碍名称，默认「预览大图」 */
  ariaLabel?: string;
};

export function ExportPreviewLightbox({ url, onClose, ariaLabel = "预览大图" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(true, panelRef, {
    onEscape: onClose,
    lockBodyScroll: true,
  });

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        role="presentation"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <button
        type="button"
        className="absolute right-3 top-3 z-[202] rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-900 shadow-md hover:bg-white dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
        onClick={onClose}
      >
        关闭
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        tabIndex={-1}
        onClick={onClose}
        className="relative z-[201] max-h-[min(92dvh,92vw)] max-w-full cursor-zoom-out rounded-lg border border-white/20 object-contain shadow-2xl"
      />
    </div>
  );
}
