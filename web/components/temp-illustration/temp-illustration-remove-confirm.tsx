"use client";

type Props = {
  open: boolean;
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function TempIllustrationRemoveConfirmDialog({ open, name, busy, onCancel, onConfirm }: Props) {
  if (!open) return null;
  const label = name.trim() || "未命名";

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-labelledby="temp-remove-title"
        aria-describedby="temp-remove-desc"
        className="w-full max-w-sm rounded-xl border border-red-200/80 bg-white p-4 shadow-2xl dark:border-red-900/50 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="temp-remove-title" className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          从临时插画移除「{label}」？
        </h3>
        <p id="temp-remove-desc" className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          将删除本机浏览器里这条记录的缩略图与已解析的 SD 参数。
          <span className="mt-1 block font-medium text-red-700 dark:text-red-400">此操作无法撤销。</span>
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "移除中…" : "确认移除"}
          </button>
        </div>
      </div>
    </div>
  );
}
