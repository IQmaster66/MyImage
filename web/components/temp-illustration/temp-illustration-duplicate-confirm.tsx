"use client";

type Props = {
  open: boolean;
  existingTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function TempIllustrationDuplicateConfirmDialog({
  open,
  existingTitle,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  const label = existingTitle.trim() || "未命名";

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-labelledby="temp-dup-title"
        aria-describedby="temp-dup-desc"
        className="w-full max-w-sm rounded-xl border border-amber-200/90 bg-white p-4 shadow-2xl dark:border-amber-900/50 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="temp-dup-title" className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          检测到重复的临时插画
        </h3>
        <p id="temp-dup-desc" className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          当前文件与已有条目「<span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
          」在<strong className="font-medium text-amber-800 dark:text-amber-300"> 图片内容 </strong>与
          <strong className="font-medium text-amber-800 dark:text-amber-300"> SD 参数 </strong>
          上完全一致。是否仍要再添加一条记录？
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
          >
            不添加
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "仍要添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
