"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AiToolsPanel } from "@/components/toolbox/ai-tools-panel";
import { ExportPreviewLightbox } from "@/components/toolbox/export-preview-lightbox";
import { ImageToolboxExportDetails } from "@/components/toolbox/image-toolbox-export-details";
import { ImageToolboxMetadataDetails } from "@/components/toolbox/image-toolbox-metadata-details";
import { ImageToolboxTempIllustrationPanel } from "@/components/toolbox/image-toolbox-temp-illustration-panel";
import { ImageToolboxPreviewAside } from "@/components/toolbox/image-toolbox-preview-aside";
import { ImageToolboxTransformDetails } from "@/components/toolbox/image-toolbox-transform-details";
import { useDebouncedExportPreview } from "@/hooks/use-debounced-export-preview";
import { useExportPreviewLightbox } from "@/hooks/use-export-preview-lightbox";
import { useToolboxCropOverlay } from "@/hooks/use-toolbox-crop-overlay";
import { useToolboxHotkeys } from "@/hooks/use-toolbox-hotkeys";
import { pickHighlightedExifFields, readImageMetadataFile } from "@/lib/image-metadata";
import type { PngTextChunkEntry } from "@/lib/png-text-chunks";
import { parseMaxDimension } from "@/lib/toolbox-parse";
import { extractStableDiffusionParameters } from "@/lib/sd-parameters";
import {
  consumeToolboxHandoffById,
  handoffFileFromConsumed,
} from "@/lib/toolbox-handoff";
import { TempIllustrationDuplicateConfirmDialog } from "@/components/temp-illustration/temp-illustration-duplicate-confirm";
import { findFullDuplicateTempIllustration, putTempIllustration } from "@/lib/temp-illustration-db";
import {
  buildPipelineCanvas,
  canvasToBlob,
  centeredAspectNormalizedRect,
  clampNormalizedRect,
  downloadBlob,
  extensionForMime,
  flipCanvas,
  fullImageNormalizedRect as fullRect,
  loadImageFromUrl,
  type ColorAdjust,
  DEFAULT_COLOR_ADJUST,
  revokeUrl,
  rotateCanvas90,
  runImageExportPipeline,
  splitGrid9,
  type ExportFormat,
  type ExportPipelineOptions,
} from "@/lib/image-toolbox";

export function ImageToolbox() {
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [baseName, setBaseName] = useState("image");
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [quality, setQuality] = useState(0.88);
  const [maxWidth, setMaxWidth] = useState("");
  const [maxHeight, setMaxHeight] = useState("");

  const [cropEnabled, setCropEnabled] = useState(false);

  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.72);

  const [exportMetaMode, setExportMetaMode] = useState<"share" | "archive">("share");
  const [colorAdjust, setColorAdjust] = useState<ColorAdjust>(() => ({ ...DEFAULT_COLOR_ADJUST }));
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const [compareEnabled, setCompareEnabled] = useState(false);

  const [circularAvatar, setCircularAvatar] = useState(false);
  const [roundedCorners, setRoundedCorners] = useState(false);
  const [roundedCornerPx, setRoundedCornerPx] = useState(24);

  const [rawOriginalUrl, setRawOriginalUrl] = useState<string | null>(null);

  const [pngChunks, setPngChunks] = useState<PngTextChunkEntry[]>([]);
  const [exifRecord, setExifRecord] = useState<Record<string, unknown> | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempSaveBusy, setTempSaveBusy] = useState(false);
  const [tempSaveHint, setTempSaveHint] = useState<string | null>(null);
  const [tempDupDialog, setTempDupDialog] = useState<{
    existingTitle: string;
    sdRaw: string | null;
  } | null>(null);

  const {
    cropRect,
    setCropRect,
    resetCrop,
    measureImg,
    cropHoleStyle,
    cropOverlayCursor,
    onCropMouseDown,
    onCropMouseMove,
    onCropMouseLeave,
  } = useToolboxCropOverlay({ imgRef, cropEnabled, previewUrl });

  useEffect(() => {
    return () => {
      revokeUrl(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (rawOriginalUrl) revokeUrl(rawOriginalUrl);
    };
  }, [rawOriginalUrl]);

  const getPipelineOptions = useCallback((): ExportPipelineOptions => {
    return {
      crop: cropEnabled ? clampNormalizedRect(cropRect) : fullRect(),
      maxW: parseMaxDimension(maxWidth),
      maxH: parseMaxDimension(maxHeight),
      color: colorAdjust,
      watermarkText,
      watermarkOpacity,
      format,
      quality,
      circularAvatar,
      roundedCornerPx: roundedCorners ? roundedCornerPx : undefined,
    };
  }, [
    cropEnabled,
    cropRect,
    maxWidth,
    maxHeight,
    colorAdjust,
    watermarkText,
    watermarkOpacity,
    format,
    quality,
    circularAvatar,
    roundedCorners,
    roundedCornerPx,
  ]);

  const { processedPreviewUrl, clearProcessedPreview, exportPreviewUpdating } = useDebouncedExportPreview(
    previewUrl,
    getPipelineOptions,
  );

  const { exportPreviewLightboxOpen, setExportPreviewLightboxOpen } =
    useExportPreviewLightbox(processedPreviewUrl);

  const closeExportLightbox = useCallback(() => {
    setExportPreviewLightboxOpen(false);
  }, []);

  const onPickFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("请选择图片文件（JPEG、PNG、WebP 等）");
        return;
      }
      setTempDupDialog(null);
      setError(null);
      if (previewUrl) revokeUrl(previewUrl);
      if (rawOriginalUrl && rawOriginalUrl !== previewUrl) revokeUrl(rawOriginalUrl);
      const uRaw = URL.createObjectURL(file);
      const uPrev = URL.createObjectURL(file);
      setRawOriginalUrl(uRaw);
      setPreviewUrl(uPrev);
      setOriginalFile(file);
      const stem = file.name.replace(/\.[^/.]+$/, "");
      setBaseName(stem || "image");
      resetCrop();
      setPngChunks([]);
      setExifRecord(null);
      setMetadataLoaded(false);
      setMetadataError(null);
      setTempSaveHint(null);
      clearProcessedPreview();
    },
    [previewUrl, rawOriginalUrl, resetCrop, clearProcessedPreview],
  );

  const onPickFileRef = useRef(onPickFile);
  onPickFileRef.current = onPickFile;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const handoffId = params.get("handoff");
    if (!handoffId?.trim()) return;
    const path = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state ?? {}, "", path);
    void consumeToolboxHandoffById(handoffId.trim())
      .then((data) => {
        if (!data) {
          setError("未能载入从临时插画传来的图片，请返回临时插画页重新发送。");
          return;
        }
        const file = handoffFileFromConsumed(data);
        onPickFileRef.current(file);
        setTempSaveHint("已从临时插画载入，可在下方「图片反推」使用 BLIP / WD。");
        requestAnimationFrame(() => {
          document.getElementById("toolbox-ai-tools")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "载入临时插画传递的图片失败");
      });
  }, []);

  const exifJsonPretty = useMemo(
    () => (exifRecord ? JSON.stringify(exifRecord, null, 2) : null),
    [exifRecord],
  );

  const exifHighlights = useMemo(() => pickHighlightedExifFields(exifRecord), [exifRecord]);

  const sdParametersRaw = useMemo(
    () => extractStableDiffusionParameters(pngChunks, exifRecord),
    [pngChunks, exifRecord],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      onPickFile(e.dataTransfer.files[0]);
    },
    [onPickFile],
  );

  const applyRotate = useCallback(
    async (cw: boolean) => {
      if (!previewUrl) return;
      setBusy(true);
      setError(null);
      try {
        const img = await loadImageFromUrl(previewUrl);
        const canvas = rotateCanvas90(img, cw);
        const blob = await canvasToBlob(canvas, "image/png");
        if (previewUrl !== rawOriginalUrl) revokeUrl(previewUrl);
        const next = URL.createObjectURL(blob);
        setPreviewUrl(next);
        resetCrop();
      } catch (e) {
        setError(e instanceof Error ? e.message : "旋转失败");
      } finally {
        setBusy(false);
      }
    },
    [previewUrl, rawOriginalUrl, resetCrop],
  );

  const applyFlip = useCallback(
    async (horizontal: boolean) => {
      if (!previewUrl) return;
      setBusy(true);
      setError(null);
      try {
        const img = await loadImageFromUrl(previewUrl);
        const canvas = flipCanvas(img, horizontal);
        const blob = await canvasToBlob(canvas, "image/png");
        if (previewUrl !== rawOriginalUrl) revokeUrl(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        resetCrop();
      } catch (e) {
        setError(e instanceof Error ? e.message : "翻转失败");
      } finally {
        setBusy(false);
      }
    },
    [previewUrl, rawOriginalUrl, resetCrop],
  );

  const handleExport = useCallback(async () => {
    if (!previewUrl) return;
    setBusy(true);
    setError(null);
    try {
      const img = await loadImageFromUrl(previewUrl);
      const blob = await runImageExportPipeline(img, getPipelineOptions());
      const ext = extensionForMime(format);
      downloadBlob(blob, `${baseName}-edited.${ext}`);
      if (exportMetaMode === "archive" && originalFile) {
        const origExt = originalFile.name.includes(".")
          ? originalFile.name.slice(originalFile.name.lastIndexOf("."))
          : "";
        window.setTimeout(() => {
          downloadBlob(originalFile, `${baseName}-归档原图${origExt || ".png"}`);
        }, 280);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }, [previewUrl, getPipelineOptions, format, baseName, exportMetaMode, originalFile]);

  const handleBatchZip = useCallback(async () => {
    if (!batchFiles.length) return;
    setBatchBusy(true);
    setError(null);
    try {
      const zip = new JSZip();
      const opts = getPipelineOptions();
      for (let i = 0; i < batchFiles.length; i++) {
        const f = batchFiles[i];
        const u = URL.createObjectURL(f);
        try {
          const img = await loadImageFromUrl(u);
          const blob = await runImageExportPipeline(img, {
            ...opts,
            crop: fullRect(),
          });
          const stem = f.name.replace(/\.[^/.]+$/, "") || `image-${i}`;
          zip.file(`${stem}.${extensionForMime(format)}`, blob);
        } finally {
          URL.revokeObjectURL(u);
        }
      }
      const zblob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zblob, `batch-${batchFiles.length}-images.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量打包失败");
    } finally {
      setBatchBusy(false);
    }
  }, [batchFiles, getPipelineOptions, format]);

  const handleGrid9Zip = useCallback(async () => {
    if (!previewUrl) return;
    setBusy(true);
    setError(null);
    try {
      const img = await loadImageFromUrl(previewUrl);
      const canvas = buildPipelineCanvas(img, getPipelineOptions());
      const cells = splitGrid9(canvas);
      const zip = new JSZip();
      const ext = extensionForMime(format);
      for (let i = 0; i < 9; i++) {
        const blob = await canvasToBlob(
          cells[i],
          format,
          format === "image/png" ? undefined : quality,
        );
        zip.file(`grid-${i + 1}.${ext}`, blob);
      }
      const zblob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zblob, `${baseName}-grid-9.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "九宫格导出失败");
    } finally {
      setBusy(false);
    }
  }, [previewUrl, getPipelineOptions, format, quality, baseName]);

  const applyAspectPreset = useCallback(
    (aw: number, ah: number) => {
      const img = imgRef.current;
      if (!img?.naturalWidth) return;
      setCropEnabled(true);
      setCropRect(centeredAspectNormalizedRect(img.naturalWidth, img.naturalHeight, aw, ah));
    },
    [setCropRect],
  );

  const applyPresetSocial = useCallback(() => {
    setFormat("image/webp");
    setQuality(0.82);
    setMaxWidth("1920");
    setMaxHeight("");
  }, []);

  const applyPresetThumb = useCallback(() => {
    setFormat("image/jpeg");
    setQuality(0.85);
    setMaxWidth("512");
    setMaxHeight("512");
  }, []);

  useToolboxHotkeys({
    suspended: exportPreviewLightboxOpen,
    onExport: handleExport,
    onRotateCw: () => void applyRotate(true),
    onResetCrop: resetCrop,
  });

  const finalizeTempIllustrationSave = useCallback(
    async (sdRaw: string | null) => {
      if (!originalFile) return;
      await putTempIllustration({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        title: baseName,
        mimeType: originalFile.type || "application/octet-stream",
        sdRaw,
        imageBlob: originalFile,
      });
      setTempSaveHint(
        sdRaw?.trim()
          ? "已保存，并已附带 SD 参数。打开「临时插画」点击缩略图即可查看。"
          : "已保存。未检测到 SD 参数；仍可点击图片查看原图。",
      );
    },
    [originalFile, baseName],
  );

  const saveToTempIllustration = useCallback(async () => {
    if (!originalFile) return;
    setTempSaveBusy(true);
    setTempSaveHint(null);
    try {
      const { pngChunks: ch, exif } = await readImageMetadataFile(originalFile);
      setPngChunks(ch);
      setExifRecord(exif);
      setMetadataLoaded(true);
      setMetadataError(null);
      const sdRaw = extractStableDiffusionParameters(ch, exif);
      const mimeType = originalFile.type || "application/octet-stream";
      const dup = await findFullDuplicateTempIllustration({
        mimeType,
        sdRaw,
        imageBlob: originalFile,
      });
      if (dup) {
        setTempDupDialog({ existingTitle: dup.title, sdRaw });
        setTempSaveHint("检测到与已有临时插画完全相同的文件与参数，请确认是否仍要添加。");
        return;
      }
      await finalizeTempIllustrationSave(sdRaw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存到临时插画失败");
    } finally {
      setTempSaveBusy(false);
    }
  }, [originalFile, finalizeTempIllustrationSave]);

  const confirmTempDupSave = useCallback(async () => {
    if (!originalFile || !tempDupDialog) return;
    setTempSaveBusy(true);
    try {
      await finalizeTempIllustrationSave(tempDupDialog.sdRaw);
      setTempDupDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存到临时插画失败");
    } finally {
      setTempSaveBusy(false);
    }
  }, [originalFile, tempDupDialog, finalizeTempIllustrationSave]);

  const cancelTempDupSave = useCallback(() => {
    setTempDupDialog(null);
    setTempSaveHint("已取消：未添加重复条目。");
  }, []);

  const readMetadata = useCallback(async () => {
    if (!originalFile) return;
    setMetadataLoading(true);
    setMetadataError(null);
    try {
      const { pngChunks: chunks, exif } = await readImageMetadataFile(originalFile);
      setPngChunks(chunks);
      setExifRecord(exif);
      setMetadataLoaded(true);
      const hasPng = chunks.length > 0;
      const hasExif = Boolean(exif && Object.keys(exif).length > 0);
      if (!hasPng && !hasExif) {
        setMetadataError(
          "未发现可读元数据。AI 图常见于：PNG 内嵌 parameters / prompt 文本块；JPEG 的 EXIF UserComment；部分工具写入 XMP。",
        );
      }
    } catch (e) {
      setMetadataError(e instanceof Error ? e.message : "读取元数据失败");
      setPngChunks([]);
      setExifRecord(null);
      setMetadataLoaded(true);
    } finally {
      setMetadataLoading(false);
    }
  }, [originalFile]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[min(100%,96rem)] flex-1 flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-5">
      <header className="shrink-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl dark:text-gray-50">
          图片工具箱
        </h1>
        <p className="text-xs leading-relaxed text-gray-600 md:text-sm dark:text-gray-400">
          左侧为编辑预览（含色彩滤镜）；下方小图为<strong className="font-medium text-gray-800 dark:text-gray-200">导出效果</strong>
          （裁剪·缩放·质量·水印等；导出小图约 0.22s 防抖刷新，连续调参时会短暂显示「更新中」）。右侧调参数时无需长页滚动即可对照。
        </p>
      </header>

      {!previewUrl ? (
        <section
          className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-center transition-colors dark:border-emerald-900/50 dark:bg-emerald-950/20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">拖拽图片到此处，或点击下方按钮选择文件</p>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700">
              选择图片
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </section>
      ) : (
        <div
          className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,420px)] lg:items-stretch"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <ImageToolboxPreviewAside
            previewUrl={previewUrl}
            onPickFile={onPickFile}
            colorAdjust={colorAdjust}
            imgRef={imgRef}
            measureImg={measureImg}
            cropEnabled={cropEnabled}
            cropHoleStyle={cropHoleStyle}
            cropOverlayCursor={cropOverlayCursor}
            onCropMouseDown={onCropMouseDown}
            onCropMouseMove={onCropMouseMove}
            onCropMouseLeave={onCropMouseLeave}
            processedPreviewUrl={processedPreviewUrl}
            exportPreviewUpdating={exportPreviewUpdating}
            onOpenExportLightbox={() => setExportPreviewLightboxOpen(true)}
            compareEnabled={compareEnabled}
            rawOriginalUrl={rawOriginalUrl}
          />

          <div className="flex max-h-[calc(100dvh-5.5rem)] min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-zinc-900">
            <ImageToolboxTransformDetails
              busy={busy}
              previewUrl={previewUrl}
              onPickFile={onPickFile}
              applyRotate={applyRotate}
              applyFlip={applyFlip}
              cropEnabled={cropEnabled}
              setCropEnabled={setCropEnabled}
              resetCrop={resetCrop}
              applyAspectPreset={applyAspectPreset}
              compareEnabled={compareEnabled}
              setCompareEnabled={setCompareEnabled}
              batchFiles={batchFiles}
              setBatchFiles={setBatchFiles}
              batchBusy={batchBusy}
              handleBatchZip={handleBatchZip}
              handleGrid9Zip={handleGrid9Zip}
            />

            <ImageToolboxExportDetails
              previewUrl={previewUrl}
              busy={busy}
              handleExport={handleExport}
              applyPresetSocial={applyPresetSocial}
              applyPresetThumb={applyPresetThumb}
              exportMetaMode={exportMetaMode}
              setExportMetaMode={setExportMetaMode}
              format={format}
              setFormat={setFormat}
              quality={quality}
              setQuality={setQuality}
              maxWidth={maxWidth}
              setMaxWidth={setMaxWidth}
              maxHeight={maxHeight}
              setMaxHeight={setMaxHeight}
              colorAdjust={colorAdjust}
              setColorAdjust={setColorAdjust}
              circularAvatar={circularAvatar}
              setCircularAvatar={setCircularAvatar}
              roundedCorners={roundedCorners}
              setRoundedCorners={setRoundedCorners}
              roundedCornerPx={roundedCornerPx}
              setRoundedCornerPx={setRoundedCornerPx}
              watermarkText={watermarkText}
              setWatermarkText={setWatermarkText}
              watermarkOpacity={watermarkOpacity}
              setWatermarkOpacity={setWatermarkOpacity}
            />

            <ImageToolboxTempIllustrationPanel
              disabled={!originalFile || Boolean(tempDupDialog)}
              busy={tempSaveBusy}
              hint={tempSaveHint}
              onSave={saveToTempIllustration}
            />

            <ImageToolboxMetadataDetails
              originalFile={originalFile}
              metadataLoading={metadataLoading}
              metadataLoaded={metadataLoaded}
              metadataError={metadataError}
              readMetadata={readMetadata}
              sdParametersRaw={sdParametersRaw}
              pngChunks={pngChunks}
              exifHighlights={exifHighlights}
              exifJsonPretty={exifJsonPretty}
              exifRecord={exifRecord}
            />
          </div>
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {exportPreviewLightboxOpen && processedPreviewUrl ? (
        <ExportPreviewLightbox url={processedPreviewUrl} onClose={closeExportLightbox} />
      ) : null}

      <TempIllustrationDuplicateConfirmDialog
        open={Boolean(tempDupDialog)}
        existingTitle={tempDupDialog?.existingTitle ?? ""}
        busy={tempSaveBusy}
        onCancel={cancelTempDupSave}
        onConfirm={confirmTempDupSave}
      />

      <AiToolsPanel imageFile={originalFile} />
    </div>
  );
}
