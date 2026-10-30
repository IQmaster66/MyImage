"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function PromptConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认删除",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="取消"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prompt-confirm-title"
        aria-describedby="prompt-confirm-desc"
        className="relative w-full max-w-sm rounded-2xl border border-red-200/80 bg-white p-5 shadow-2xl dark:border-red-900/50 dark:bg-zinc-900"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 id="prompt-confirm-title" className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              {title}
            </h3>
            <p id="prompt-confirm-desc" className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "删除中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
