"use client";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  /** 继续用系统文件夹选择器（随后可能出现浏览器「查看文件」权限提示） */
  onConfirmNative: () => void | Promise<void>;
  /** 改用兼容选择，一般不会出现该权限提示 */
  onUseCompat: () => void;
};

/** 系统权限框不可定制；在弹出前用本站样式说明用途与可选方式。 */
export function FolderBrowsePermissionDialog({
  open,
  busy = false,
  onCancel,
  onConfirmNative,
  onUseCompat,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-perm-title"
        aria-describedby="folder-perm-desc"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-200/70 bg-white shadow-2xl shadow-emerald-950/10 dark:border-emerald-900/50 dark:bg-zinc-900 dark:shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white px-5 py-4 dark:border-emerald-900/40 dark:from-emerald-950/50 dark:via-zinc-900 dark:to-zinc-900">
          <p className="text-[11px] font-medium tracking-wide text-emerald-700/80 uppercase dark:text-emerald-300/80">
            文件夹浏览
          </p>
          <h3
            id="folder-perm-title"
            className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50"
          >
            即将选择本机文件夹
          </h3>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p id="folder-perm-desc" className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            接下来浏览器可能会弹出
            <span className="mx-0.5 font-medium text-gray-900 dark:text-gray-100">
              「允许网站查看文件」
            </span>
            一类提示——这是 Chrome / Edge 的系统对话框，网站无法改样式。
          </p>
          <ul className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3 text-[13px] leading-relaxed text-gray-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-gray-300">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span>仅在本地读取你选中的文件夹，用于预览与打包 ZIP。</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span>不会上传到服务器，也不会删除或改写磁盘上的原文件。</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span>若不想看到该系统权限提示，可改用下方「兼容选择」。</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-950/40">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onUseCompat}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
          >
            兼容选择
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirmNative()}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "打开中…" : "继续选择"}
          </button>
        </div>
      </div>
    </div>
  );
}
