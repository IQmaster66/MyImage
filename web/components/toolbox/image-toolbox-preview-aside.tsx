"use client";

import { colorAdjustToCssFilter, type ColorAdjust } from "@/lib/image-toolbox";
import type { CSSProperties, MouseEvent, RefObject } from "react";
import { useRef } from "react";

export type FolderBrowsePreviewChrome = {
  caption: string;
  canNavigate: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export type ImageToolboxPreviewAsideProps = {
  previewUrl: string;
  onPickFile: (file: File | undefined) => void;
  colorAdjust: ColorAdjust;
  imgRef: RefObject<HTMLImageElement | null>;
  measureImg: () => void;
  cropEnabled: boolean;
  cropHoleStyle: CSSProperties | { readonly display: "none" };
  cropOverlayCursor: string;
  onCropMouseDown: (e: MouseEvent) => void;
  onCropMouseMove: (e: MouseEvent) => void;
  onCropMouseLeave: () => void;
  processedPreviewUrl: string | null;
  /** 防抖或导出管线计算中 */
  exportPreviewUpdating: boolean;
  onOpenExportLightbox: () => void;
  compareEnabled: boolean;
  rawOriginalUrl: string | null;
  /** 文件夹浏览模式：导航放在图片下方，不遮挡画面 */
  folderBrowse?: FolderBrowsePreviewChrome | null;
};

export function ImageToolboxPreviewAside({
  previewUrl,
  onPickFile,
  colorAdjust,
  imgRef,
  measureImg,
  cropEnabled,
  cropHoleStyle,
  cropOverlayCursor,
  onCropMouseDown,
  onCropMouseMove,
  onCropMouseLeave,
  processedPreviewUrl,
  exportPreviewUpdating,
  onOpenExportLightbox,
  compareEnabled,
  rawOriginalUrl,
  folderBrowse = null,
}: ImageToolboxPreviewAsideProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const folderMode = Boolean(folderBrowse);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col gap-3 self-start overflow-y-auto rounded-xl border border-emerald-200/80 bg-white p-3 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900 lg:sticky lg:top-14 lg:max-h-[calc(100dvh-5.5rem)]">
      <div>
        <div className="relative mx-auto flex justify-center">
          <div className="relative inline-block max-w-full rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-zinc-950">
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                onPickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={previewUrl}
              alt={folderMode ? "文件夹浏览预览" : "编辑预览"}
              onLoad={measureImg}
              style={{ filter: colorAdjustToCssFilter(colorAdjust) }}
              className="pointer-events-none mx-auto block max-h-[min(58dvh,720px)] max-w-full select-none object-contain"
              draggable={false}
            />
            {!cropEnabled && !folderMode ? (
              <button
                type="button"
                aria-label="点击更换图片"
                title="点击更换图片"
                onClick={() => replaceInputRef.current?.click()}
                className="absolute inset-0 z-10 cursor-pointer rounded-lg bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            ) : null}
            {cropEnabled ? (
              <div
                role="region"
                aria-label="裁剪：在画面上拖拽调整选区"
                className="absolute inset-0 z-[5]"
                style={{ cursor: cropOverlayCursor }}
                onMouseDown={onCropMouseDown}
                onMouseMove={onCropMouseMove}
                onMouseLeave={onCropMouseLeave}
              >
                <div
                  className="pointer-events-none absolute border-2 border-green-500 bg-green-500/20 dark:border-green-400 dark:bg-green-400/20"
                  style={cropHoleStyle}
                />
              </div>
            ) : null}
            {cropEnabled ? (
              <button
                type="button"
                title="更换图片"
                onClick={() => replaceInputRef.current?.click()}
                className="absolute right-2 top-2 z-20 rounded-md border border-white/30 bg-black/55 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                更换图片
              </button>
            ) : null}
          </div>
        </div>
        {folderBrowse ? (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="上一张"
              title="上一张（←）"
              disabled={!folderBrowse.canNavigate}
              onClick={folderBrowse.onPrev}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
            >
              上一张
            </button>
            <p
              className="min-w-0 flex-1 truncate text-center text-[11px] text-gray-500 dark:text-gray-400"
              title={folderBrowse.caption}
            >
              {folderBrowse.caption}
            </p>
            <button
              type="button"
              aria-label="下一张"
              title="下一张（→）"
              disabled={!folderBrowse.canNavigate}
              onClick={folderBrowse.onNext}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
            >
              下一张
            </button>
          </div>
        ) : (
          <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
            {cropEnabled
              ? "绿框四边/四角附近（约 10px）：拉伸或收缩；框内中部：平移选区；框外：新建选区。整图选区时靠边/角可缩边，中部仍为拉框。右侧调参后下方「导出效果」会同步。右上角可更换图片。"
              : "点击上方预览区域可重新选择图片；开启右侧「裁剪」后在此框选"}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {exportPreviewUpdating ? "正在根据当前参数重新生成导出预览。" : ""}
        </p>
        <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          导出效果（实时）
          {processedPreviewUrl ? (
            <span className="mt-0.5 block font-normal font-sans normal-case text-gray-500 dark:text-gray-400">
              点击缩略图放大
            </span>
          ) : null}
        </p>
        <div className="relative flex min-h-[5rem] items-center justify-center rounded-lg bg-gray-50 dark:bg-zinc-950/80">
          {processedPreviewUrl ? (
            <button
              type="button"
              onClick={onOpenExportLightbox}
              aria-label="放大查看导出预览"
              className="relative cursor-zoom-in rounded-md border border-transparent p-0 transition hover:border-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:border-emerald-500/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={processedPreviewUrl}
                alt="导出预览"
                className={`max-h-40 max-w-full rounded-md border object-contain shadow-sm dark:border-emerald-800 ${
                  exportPreviewUpdating ? "border-emerald-300/50 opacity-75" : "border-emerald-200"
                }`}
              />
              {exportPreviewUpdating ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/25 text-[11px] font-medium text-white">
                  更新中…
                </span>
              ) : null}
            </button>
          ) : (
            <p className="text-xs text-gray-400">{exportPreviewUpdating ? "准备预览…" : "生成中…"}</p>
          )}
        </div>
      </div>

      {compareEnabled && rawOriginalUrl ? (
        <div className="shrink-0 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">并排对比</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500">原图</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rawOriginalUrl}
                alt=""
                className="max-h-32 w-full rounded border border-gray-200 object-contain dark:border-gray-700"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500">导出（点击放大）</p>
              {processedPreviewUrl ? (
                <button
                  type="button"
                  onClick={onOpenExportLightbox}
                  aria-label="放大查看导出预览"
                  className="relative w-full cursor-zoom-in rounded border border-transparent p-0 text-left transition hover:border-emerald-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:border-emerald-500/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={processedPreviewUrl}
                    alt=""
                    className={`max-h-32 w-full rounded border object-contain dark:border-emerald-900 ${
                      exportPreviewUpdating ? "border-emerald-300/50 opacity-75" : "border-emerald-200"
                    }`}
                  />
                  {exportPreviewUpdating ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-black/25 text-[10px] font-medium text-white">
                      更新中
                    </span>
                  ) : null}
                </button>
              ) : (
                <p className="py-6 text-center text-[10px] text-gray-400">…</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
