"use client";

import type { Dispatch, SetStateAction } from "react";

export type ImageToolboxTransformDetailsProps = {
  busy: boolean;
  previewUrl: string | null;
  onPickFile: (file: File | undefined) => void;
  applyRotate: (cw: boolean) => void;
  applyFlip: (horizontal: boolean) => void;
  cropEnabled: boolean;
  setCropEnabled: Dispatch<SetStateAction<boolean>>;
  resetCrop: () => void;
  applyAspectPreset: (aw: number, ah: number) => void;
  compareEnabled: boolean;
  setCompareEnabled: Dispatch<SetStateAction<boolean>>;
  batchFiles: File[];
  setBatchFiles: Dispatch<SetStateAction<File[]>>;
  batchBusy: boolean;
  handleBatchZip: () => void | Promise<void>;
  handleGrid9Zip: () => void | Promise<void>;
};

export function ImageToolboxTransformDetails({
  busy,
  previewUrl,
  onPickFile,
  applyRotate,
  applyFlip,
  cropEnabled,
  setCropEnabled,
  resetCrop,
  applyAspectPreset,
  compareEnabled,
  setCompareEnabled,
  batchFiles,
  setBatchFiles,
  batchBusy,
  handleBatchZip,
  handleGrid9Zip,
}: ImageToolboxTransformDetailsProps) {
  return (
    <details open className="rounded-lg border border-gray-100 dark:border-gray-700/80">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        变换、裁剪与工具
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
            重新选择
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyRotate(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            顺时针 90°
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyRotate(false)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            逆时针 90°
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
            <input
              type="checkbox"
              checked={cropEnabled}
              onChange={(e) => {
                setCropEnabled(e.target.checked);
                if (!e.target.checked) resetCrop();
              }}
              className="rounded border-gray-400 text-green-600 focus:ring-green-500"
            />
            裁剪
          </label>
          <button
            type="button"
            onClick={resetCrop}
            className="rounded-lg px-3 py-2 text-sm text-green-700 hover:underline dark:text-green-400"
          >
            重置裁剪框
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyFlip(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            水平翻转
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyFlip(false)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            垂直翻转
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">固定比例（居中裁剪）</span>
          <button
            type="button"
            onClick={() => applyAspectPreset(1, 1)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
          >
            1:1
          </button>
          <button
            type="button"
            onClick={() => applyAspectPreset(16, 9)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => applyAspectPreset(9, 16)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
          >
            9:16
          </button>
          <button
            type="button"
            onClick={() => applyAspectPreset(4, 3)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
          >
            4:3
          </button>
          <button
            type="button"
            onClick={() => applyAspectPreset(3, 4)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
          >
            3:4
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(e) => setCompareEnabled(e.target.checked)}
            className="rounded border-gray-400 text-green-600 focus:ring-green-500"
          />
          在左侧栏底部显示「原图 | 导出」并排小图（已有上方实时导出预览时可关）
        </label>

        <div className="rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
          <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">批量处理</p>
          <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
            多选图片后使用下方「导出」区的格式/尺寸/水印等预设，一键打入 ZIP（每张整图处理，不含裁剪框）。
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="block w-full max-w-md text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-green-600 file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => setBatchFiles(Array.from(e.target.files ?? []))}
          />
          <p className="mt-2 text-[11px] text-gray-500">已选 {batchFiles.length} 张</p>
          <button
            type="button"
            disabled={!batchFiles.length || batchBusy}
            onClick={() => void handleBatchZip()}
            className="mt-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {batchBusy ? "打包中…" : "批量导出 ZIP"}
          </button>
        </div>

        <button
          type="button"
          disabled={!previewUrl || busy}
          onClick={() => void handleGrid9Zip()}
          className="rounded-lg border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/40"
        >
          九宫格切图（ZIP）
        </button>

        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          快捷键：<kbd className="rounded bg-gray-100 px-1 dark:bg-zinc-800">E</kbd> 或{" "}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-zinc-800">⌘/Ctrl+S</kbd> 导出，{" "}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-zinc-800">R</kbd> 顺时针旋转，{" "}
          <kbd className="rounded bg-gray-100 px-1 dark:bg-zinc-800">0</kbd> 重置裁剪。
        </p>
      </div>
    </details>
  );
}
