"use client";

function isErrorCopyMessage(msg: string): boolean {
  return /失败|权限|限制|无法/.test(msg);
}

export type CopyStatusBannerProps = {
  message: string | null;
  className?: string;
};

/** 内联复制结果提示（成功绿 / 失败红） */
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
 * 固定在视窗顶部居中（紧贴站点导航下方），避免长参数页滚动后看不到；
 * 使用 flex 居中，避免 translate 在部分环境下显得「偏一边」。
 */
export function CopyFeedbackToast({ message }: CopyFeedbackToastProps) {
  if (!message) return null;
  return (
    <div
      className="pointer-events-none fixed top-20 right-0 left-0 z-[300] flex justify-center px-3 sm:px-4"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-2xl">
        <CopyStatusBanner message={message} className="shadow-xl ring-1 ring-black/10 dark:ring-white/10" />
      </div>
    </div>
  );
}
