"use client";

export type AdminDeleteAllTarget = "temp" | "character";

type Props = {
  open: boolean;
  target: AdminDeleteAllTarget | null;
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

const COPY: Record<
  AdminDeleteAllTarget,
  { title: string; body: string }
> = {
  temp: {
    title: "删除全部临时插画？",
    body: "将清空服务端数据库中的全部临时插画条目，并删除 MinIO 中对应的图片对象。人物百科不受影响。",
  },
  character: {
    title: "删除全部人物百科？",
    body: "将清空服务端数据库中的全部人物卡片（含两套提示词），并删除 MinIO 中对应的封面图。临时插画不受影响。",
  },
};

/** 后台「全部删除」确认框，样式对齐项目内 alertdialog（红边、backdrop-blur）。 */
export function AdminDeleteAllConfirmDialog({
  open,
  target,
  count,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  if (!open || !target) return null;
  const copy = COPY[target];

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-labelledby="admin-delete-all-title"
        aria-describedby="admin-delete-all-desc"
        className="w-full max-w-sm rounded-xl border border-red-200/80 bg-white p-4 shadow-2xl dark:border-red-900/50 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="admin-delete-all-title" className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          {copy.title}
        </h3>
        <p id="admin-delete-all-desc" className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {copy.body}
          <span className="mt-2 block font-medium text-gray-800 dark:text-gray-200">
            当前约 {count} 项将被删除。
          </span>
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
            disabled={busy || count <= 0}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "删除中…" : "确认全部删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
