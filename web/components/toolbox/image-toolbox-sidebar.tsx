"use client";

import type { ReactNode } from "react";

export type ToolboxSidebarTab = "edit" | "tagger" | "more";

const TABS: { id: ToolboxSidebarTab; label: string }[] = [
  { id: "edit", label: "编辑导出" },
  { id: "tagger", label: "标签反推" },
  { id: "more", label: "更多" },
];

type Props = {
  tab: ToolboxSidebarTab;
  onTabChange: (tab: ToolboxSidebarTab) => void;
  fileName: string | null;
  busy: boolean;
  onExport: () => void;
  editPane: ReactNode;
  taggerPane: ReactNode;
  morePane: ReactNode;
};

export function ImageToolboxSidebar({
  tab,
  onTabChange,
  fileName,
  busy,
  onExport,
  editPane,
  taggerPane,
  morePane,
}: Props) {
  return (
    <div className="flex min-h-0 max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-zinc-900">
      <div className="shrink-0 border-b border-gray-100 bg-white/95 px-3 py-2.5 backdrop-blur-sm dark:border-gray-800 dark:bg-zinc-900/95">
        <div
          className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-zinc-800"
          role="tablist"
          aria-label="工具箱功能"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition sm:text-[13px] ${
                tab === t.id
                  ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-900 dark:text-emerald-300"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {fileName ? (
          <p className="mt-2 truncate text-[11px] text-gray-500 dark:text-gray-400" title={fileName}>
            当前：{fileName}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div role="tabpanel" hidden={tab !== "edit"} className={tab === "edit" ? "space-y-3" : "hidden"}>
          {editPane}
        </div>
        <div role="tabpanel" hidden={tab !== "tagger"} className={tab === "tagger" ? undefined : "hidden"}>
          {taggerPane}
        </div>
        <div role="tabpanel" hidden={tab !== "more"} className={tab === "more" ? "space-y-3" : "hidden"}>
          {morePane}
        </div>
      </div>

      {tab === "edit" ? (
        <div className="shrink-0 border-t border-gray-100 bg-white/95 p-3 backdrop-blur-sm dark:border-gray-800 dark:bg-zinc-900/95">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExport()}
            className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "处理中…" : "导出下载"}
          </button>
          <p className="mt-1.5 text-center text-[10px] text-gray-500 dark:text-gray-500">
            快捷键 Ctrl+S（Mac：⌘S）
          </p>
        </div>
      ) : null}
    </div>
  );
}
