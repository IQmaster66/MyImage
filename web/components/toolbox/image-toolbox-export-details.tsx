"use client";

import { DEFAULT_COLOR_ADJUST, type ColorAdjust, type ExportFormat } from "@/lib/image-toolbox";
import type { Dispatch, SetStateAction } from "react";

export type ImageToolboxExportDetailsProps = {
  previewUrl: string | null;
  busy: boolean;
  handleExport: () => void | Promise<void>;
  applyPresetSocial: () => void;
  applyPresetThumb: () => void;
  exportMetaMode: "share" | "archive";
  setExportMetaMode: Dispatch<SetStateAction<"share" | "archive">>;
  format: ExportFormat;
  setFormat: Dispatch<SetStateAction<ExportFormat>>;
  quality: number;
  setQuality: Dispatch<SetStateAction<number>>;
  maxWidth: string;
  setMaxWidth: Dispatch<SetStateAction<string>>;
  maxHeight: string;
  setMaxHeight: Dispatch<SetStateAction<string>>;
  colorAdjust: ColorAdjust;
  setColorAdjust: Dispatch<SetStateAction<ColorAdjust>>;
  circularAvatar: boolean;
  setCircularAvatar: Dispatch<SetStateAction<boolean>>;
  roundedCorners: boolean;
  setRoundedCorners: Dispatch<SetStateAction<boolean>>;
  roundedCornerPx: number;
  setRoundedCornerPx: Dispatch<SetStateAction<number>>;
  watermarkText: string;
  setWatermarkText: Dispatch<SetStateAction<string>>;
  watermarkOpacity: number;
  setWatermarkOpacity: Dispatch<SetStateAction<number>>;
};

export function ImageToolboxExportDetails({
  previewUrl,
  busy,
  handleExport,
  applyPresetSocial,
  applyPresetThumb,
  exportMetaMode,
  setExportMetaMode,
  format,
  setFormat,
  quality,
  setQuality,
  maxWidth,
  setMaxWidth,
  maxHeight,
  setMaxHeight,
  colorAdjust,
  setColorAdjust,
  circularAvatar,
  setCircularAvatar,
  roundedCorners,
  setRoundedCorners,
  roundedCornerPx,
  setRoundedCornerPx,
  watermarkText,
  setWatermarkText,
  watermarkOpacity,
  setWatermarkOpacity,
}: ImageToolboxExportDetailsProps) {
  return (
    <details open className="rounded-lg border border-gray-100 dark:border-gray-700/80">
      <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
        导出、色彩、形状与水印
      </summary>
      <div className="space-y-4 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">导出</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyPresetSocial}
              className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200"
            >
              预设：社交 WebP 宽 1920
            </button>
            <button
              type="button"
              onClick={applyPresetThumb}
              className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200"
            >
              预设：缩略 512×512
            </button>
          </div>
          <div className="space-y-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700/80">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">元数据策略</p>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="exportMeta"
                checked={exportMetaMode === "share"}
                onChange={() => setExportMetaMode("share")}
                className="text-green-600"
              />
              分享：仅下载处理后的图（无 EXIF/PNG 块）
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="exportMeta"
                checked={exportMetaMode === "archive"}
                onChange={() => setExportMetaMode("archive")}
                className="text-green-600"
              />
              归档：额外再存一份未编辑的原始文件（完整保留原图内元数据）
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            格式
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="image/png">PNG（无损，体积大）</option>
              <option value="image/jpeg">JPEG（体积小，有损）</option>
              <option value="image/webp">WebP（推荐）</option>
            </select>
          </label>
          {format !== "image/png" ? (
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              质量 {(quality * 100).toFixed(0)}%
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.02}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="mt-2 w-full accent-green-600"
              />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              最大宽度（px，可选）
              <input
                value={maxWidth}
                onChange={(e) => setMaxWidth(e.target.value)}
                placeholder="不限"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              最大高度（px，可选）
              <input
                value={maxHeight}
                onChange={(e) => setMaxHeight(e.target.value)}
                placeholder="不限"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700/80">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">色彩（CSS 类；导出时写入像素）</p>
            <label className="block text-[11px] text-gray-600 dark:text-gray-400">
              亮度 {(colorAdjust.brightness * 100).toFixed(0)}%
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.02}
                value={colorAdjust.brightness}
                onChange={(e) =>
                  setColorAdjust((a) => ({
                    ...a,
                    brightness: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full accent-green-600"
              />
            </label>
            <label className="block text-[11px] text-gray-600 dark:text-gray-400">
              对比度 {(colorAdjust.contrast * 100).toFixed(0)}%
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.02}
                value={colorAdjust.contrast}
                onChange={(e) =>
                  setColorAdjust((a) => ({ ...a, contrast: Number(e.target.value) }))
                }
                className="mt-1 w-full accent-green-600"
              />
            </label>
            <label className="block text-[11px] text-gray-600 dark:text-gray-400">
              饱和度 {(colorAdjust.saturate * 100).toFixed(0)}%
              <input
                type="range"
                min={0}
                max={2}
                step={0.02}
                value={colorAdjust.saturate}
                onChange={(e) =>
                  setColorAdjust((a) => ({ ...a, saturate: Number(e.target.value) }))
                }
                className="mt-1 w-full accent-green-600"
              />
            </label>
            <label className="block text-[11px] text-gray-600 dark:text-gray-400">
              色相旋转 {colorAdjust.hueRotateDeg}°
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={colorAdjust.hueRotateDeg}
                onChange={(e) =>
                  setColorAdjust((a) => ({
                    ...a,
                    hueRotateDeg: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full accent-green-600"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={colorAdjust.grayscale}
                onChange={(e) =>
                  setColorAdjust((a) => ({ ...a, grayscale: e.target.checked }))
                }
                className="rounded border-gray-400 text-green-600"
              />
              灰度
            </label>
            <button
              type="button"
              onClick={() => setColorAdjust({ ...DEFAULT_COLOR_ADJUST })}
              className="text-xs text-green-700 hover:underline dark:text-green-400"
            >
              重置色彩
            </button>
          </div>

          <div className="space-y-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700/80">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">形状导出</p>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={circularAvatar}
                onChange={(e) => {
                  setCircularAvatar(e.target.checked);
                  if (e.target.checked) setRoundedCorners(false);
                }}
                className="rounded border-gray-400 text-green-600"
              />
              圆形头像（居中取正方形后裁圆）
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={roundedCorners}
                onChange={(e) => {
                  setRoundedCorners(e.target.checked);
                  if (e.target.checked) setCircularAvatar(false);
                }}
                className="rounded border-gray-400 text-green-600"
              />
              圆角矩形
            </label>
            {roundedCorners ? (
              <label className="block text-[11px] text-gray-600 dark:text-gray-400">
                圆角半径 {roundedCornerPx}px
                <input
                  type="range"
                  min={4}
                  max={Math.min(120, 400)}
                  step={2}
                  value={roundedCornerPx}
                  onChange={(e) => setRoundedCornerPx(Number(e.target.value))}
                  className="mt-1 w-full accent-green-600"
                />
              </label>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!previewUrl || busy}
            onClick={() => void handleExport()}
            className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "处理中…" : "导出下载"}
          </button>
        </div>

        <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">水印（可选）</h2>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            文字
            <input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="例如 © Your Name"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            不透明度 {(watermarkOpacity * 100).toFixed(0)}%
            <input
              type="range"
              min={0.25}
              max={1}
              step={0.05}
              value={watermarkOpacity}
              onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
              className="mt-2 w-full accent-green-600"
            />
          </label>
        </div>
      </div>
    </details>
  );
}
