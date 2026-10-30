"use client";

import Link from "next/link";

type Props = {
  disabled: boolean;
  busy: boolean;
  hint: string | null;
  onSave: () => void | Promise<void>;
};

export function ImageToolboxTempIllustrationPanel({ disabled, busy, hint, onSave }: Props) {
  return (
    <details className="rounded-lg border border-gray-100 dark:border-gray-700/80">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        临时插画
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          将<strong className="font-medium text-gray-800 dark:text-gray-200">当前上传的原始文件</strong>
          上传至 MinIO 并写入服务端条目（含生成参数）。解析 PNG / EXIF 中的 A1111 parameters 或 ComfyUI prompt/workflow，并一并保存；在临时插画页点击缩略图即可查看参数卡片。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onSave()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "保存中…" : "存到临时插画"}
          </button>
          <Link
            href="/temp-illustration"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
          >
            打开临时插画页
          </Link>
        </div>
        {hint ? (
          <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300" role="status">
            {hint}
          </p>
        ) : null}
      </div>
    </details>
  );
}
