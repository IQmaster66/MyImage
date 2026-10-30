"use client";

import Link from "next/link";

type Props = {
  disabled: boolean;
  busy: boolean;
  hint: string | null;
  onSave: () => void | Promise<void>;
};

export function ImageToolboxCharacterPanel({ disabled, busy, hint, onSave }: Props) {
  return (
    <details className="rounded-lg border border-gray-100 dark:border-gray-700/80">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        人物百科
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-2 pt-3 pb-3 dark:border-gray-700/80">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          将<strong className="font-medium text-gray-800 dark:text-gray-200">当前上传的原始文件</strong>
          上传至 MinIO 并新增一条人物条目。名称、提示词、出自均留空，可稍后在人物百科中编辑。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onSave()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "保存中…" : "存到人物百科"}
          </button>
          <Link
            href="/character"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
          >
            打开人物百科
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
