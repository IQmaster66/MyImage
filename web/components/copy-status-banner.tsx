"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

function isErrorCopyMessage(msg: string): boolean {
  return /失败|权限|限制|无法|为空/.test(msg);
}

export type CopyStatusBannerProps = {
  message: string | null;
  className?: string;
};

/** 提示条外观（成功绿 / 失败红）；勿单独插入文档流，请用 CopyFeedbackToast */
export function CopyStatusBanner({ message, className }: CopyStatusBannerProps) {
  if (!message) return null;
  const err = isErrorCopyMessage(message);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`max-h-[min(45vh,14rem)] overflow-y-auto rounded-lg border px-3 py-2.5 text-sm font-medium leading-snug break-words whitespace-normal shadow-sm ${
        err
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
      } ${className ?? ""}`}
    >
      {message}
    </div>
  );
}

export type CopyFeedbackToastProps = {
  message: string | null;
};

/**
 * 固定浮层提示（portal 到 body），不占文档流，避免复制时页面抖动。
 * 紧贴站点导航下方居中。
 */
export function CopyFeedbackToast({ message }: CopyFeedbackToastProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !message || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed top-20 right-0 left-0 z-[300] flex justify-center px-3 sm:px-4"
      aria-live="polite"
    >
      <div className="copy-feedback-toast pointer-events-auto w-full max-w-md sm:max-w-lg">
        <CopyStatusBanner
          message={message}
          className="shadow-xl ring-1 ring-black/10 dark:ring-white/10"
        />
      </div>
    </div>,
    document.body,
  );
}
