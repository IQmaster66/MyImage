"use client";

import type { FolderBrowseNotice } from "@/hooks/use-folder-image-browse";

type Props = {
  notice: FolderBrowseNotice | null;
  onDismiss: () => void;
};

const TONE: Record<
  NonNullable<FolderBrowseNotice>["tone"],
  { shell: string; accent: string; title: string; detail: string; close: string }
> = {
  success: {
    shell:
      "border-emerald-200/90 bg-white/95 shadow-lg shadow-emerald-900/5 ring-1 ring-emerald-900/5 dark:border-emerald-800/60 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/5",
    accent: "bg-emerald-500",
    title: "text-emerald-950 dark:text-emerald-100",
    detail: "text-emerald-900/70 dark:text-emerald-200/70",
    close:
      "text-emerald-800/55 hover:bg-emerald-100 hover:text-emerald-950 dark:text-emerald-200/50 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-50",
  },
  info: {
    shell:
      "border-sky-200/90 bg-white/95 shadow-lg shadow-sky-900/5 ring-1 ring-sky-900/5 dark:border-sky-800/60 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/5",
    accent: "bg-sky-500",
    title: "text-sky-950 dark:text-sky-100",
    detail: "text-sky-900/70 dark:text-sky-200/70",
    close:
      "text-sky-800/55 hover:bg-sky-100 hover:text-sky-950 dark:text-sky-200/50 dark:hover:bg-sky-950/60 dark:hover:text-sky-50",
  },
  warn: {
    shell:
      "border-amber-200/90 bg-white/95 shadow-lg shadow-amber-900/5 ring-1 ring-amber-900/5 dark:border-amber-800/60 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/5",
    accent: "bg-amber-500",
    title: "text-amber-950 dark:text-amber-100",
    detail: "text-amber-900/70 dark:text-amber-200/70",
    close:
      "text-amber-800/55 hover:bg-amber-100 hover:text-amber-950 dark:text-amber-200/50 dark:hover:bg-amber-950/60 dark:hover:text-amber-50",
  },
  error: {
    shell:
      "border-red-200/90 bg-white/95 shadow-lg shadow-red-900/5 ring-1 ring-red-900/5 dark:border-red-800/60 dark:bg-zinc-900/95 dark:shadow-black/40 dark:ring-white/5",
    accent: "bg-red-500",
    title: "text-red-950 dark:text-red-100",
    detail: "text-red-900/70 dark:text-red-200/70",
    close:
      "text-red-800/55 hover:bg-red-100 hover:text-red-950 dark:text-red-200/50 dark:hover:bg-red-950/60 dark:hover:text-red-50",
  },
};

/** 文件夹浏览操作反馈：顶栏下方居中浮层，不挡左侧大图 */
export function FolderBrowseNoticeToast({ notice, onDismiss }: Props) {
  if (!notice) return null;
  const t = TONE[notice.tone];

  return (
    <div
      className="pointer-events-none fixed top-20 right-0 left-0 z-[300] flex justify-center px-3 sm:px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        role="status"
        className={`pointer-events-auto flex w-full max-w-md overflow-hidden rounded-xl border backdrop-blur-md ${t.shell}`}
      >
        <span className={`w-1 shrink-0 self-stretch ${t.accent}`} aria-hidden />
        <div className="min-w-0 flex-1 px-3.5 py-3">
          <p className={`text-sm font-semibold tracking-tight ${t.title}`}>{notice.title}</p>
          {notice.detail ? (
            <p className={`mt-1 text-[12px] leading-relaxed ${t.detail}`}>{notice.detail}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭提示"
          className={`m-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base leading-none transition ${t.close}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
