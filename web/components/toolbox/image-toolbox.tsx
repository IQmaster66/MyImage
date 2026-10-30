"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ExportPreviewLightbox } from "@/components/toolbox/export-preview-lightbox";
import {
  ImageToolboxSidebar,
  type ToolboxSidebarTab,
} from "@/components/toolbox/image-toolbox-sidebar";
import { ToolboxAuxAiPanel } from "@/components/toolbox/toolbox-aux-ai-panel";
import { WdTaggerPanel } from "@/components/toolbox/wd-tagger-panel";
import { ImageToolboxExportDetails } from "@/components/toolbox/image-toolbox-export-details";
import { ImageToolboxMetadataExportPanel } from "@/components/toolbox/image-toolbox-metadata-export-panel";
import { ImageToolboxMetadataDetails } from "@/components/toolbox/image-toolbox-metadata-details";
import { FolderBrowseNoticeToast } from "@/components/toolbox/folder-browse-notice-toast";
import { ImageToolboxFolderBrowsePanel } from "@/components/toolbox/image-toolbox-folder-browse-panel";
import { ImageToolboxPngFolderConvertPanel } from "@/components/toolbox/image-toolbox-png-folder-convert-panel";
import { ImageToolboxCharacterPanel } from "@/components/toolbox/image-toolbox-character-panel";
import { ImageToolboxTempIllustrationPanel } from "@/components/toolbox/image-toolbox-temp-illustration-panel";
import { saveCharacterFromBlob } from "@/lib/character-api";
import { ImageToolboxPreviewAside } from "@/components/toolbox/image-toolbox-preview-aside";
import { ImageToolboxTransformDetails } from "@/components/toolbox/image-toolbox-transform-details";
import { useDebouncedExportPreview } from "@/hooks/use-debounced-export-preview";
import { useExportPreviewLightbox } from "@/hooks/use-export-preview-lightbox";
import { useFolderImageBrowse } from "@/hooks/use-folder-image-browse";
import {
  useToolboxSessionPersist,
  type RestoredToolboxSession,
} from "@/hooks/use-toolbox-session-persist";
import { useToolboxCropOverlay } from "@/hooks/use-toolbox-crop-overlay";
import { useToolboxHotkeys } from "@/hooks/use-toolbox-hotkeys";
import { pickHighlightedExifFields, readImageMetadataFile } from "@/lib/image-metadata";
import type { PngTextChunkEntry } from "@/lib/png-text-chunks";
import { parseMaxDimension } from "@/lib/toolbox-parse";
import { extractStableDiffusionParameters } from "@/lib/sd-parameters";
import {
  getToolboxHandoffIdFromUrlOrSession,
  handoffFileFromConsumed,
  isImageLikeHandoffFile,
  peekToolboxHandoffOnce,
  scheduleFinalizeToolboxHandoff,
} from "@/lib/toolbox-handoff";
import type { WdTaggerPersistedSnapshot } from "@/lib/wd-tagger-session";
import { TempIllustrationDuplicateConfirmDialog } from "@/components/temp-illustration/temp-illustration-duplicate-confirm";
import {
  findFullDuplicateTempIllustration,
  saveTempIllustrationFromBlob,
} from "@/lib/temp-illustration-api";
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
  const [charSaveBusy, setCharSaveBusy] = useState(false);
  const [charSaveHint, setCharSaveHint] = useState<string | null>(null);
  const [tempDupDialog, setTempDupDialog] = useState<{
    existingTitle: string;
    sdRaw: string | null;
  } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ToolboxSidebarTab>("edit");
  const [hydrateReady, setHydrateReady] = useState(false);
  const [sessionRestoreHint, setSessionRestoreHint] = useState<string | null>(null);
  const [wdTaggerSnapshot, setWdTaggerSnapshot] = useState<WdTaggerPersistedSnapshot | null>(null);

  const folderBrowse = useFolderImageBrowse();
  const lastFolderSyncPathRef = useRef<string | null>(null);

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

  const loadImageFile = useCallback(
    (
      file: File,
      options?: {
        sidebarTab?: ToolboxSidebarTab;
        keepTempHint?: boolean;
        /** 文件夹左右切换：共用一个 object URL，少做一轮状态重置 */
        folderNavigate?: boolean;
      },
    ) => {
      if (!isImageLikeHandoffFile(file)) {
        setError("请选择图片文件（JPEG、PNG、WebP 等）");
        return;
      }
      setTempDupDialog(null);
      setError(null);
      if (previewUrl) revokeUrl(previewUrl);
      if (rawOriginalUrl && rawOriginalUrl !== previewUrl) revokeUrl(rawOriginalUrl);
      const u = URL.createObjectURL(file);
      // 文件夹连切时 raw/preview 共用同一 URL，减半 blob URL 开销
      setRawOriginalUrl(u);
      setPreviewUrl(u);
      setOriginalFile(file);
      const stem = file.name.replace(/\.[^/.]+$/, "");
      setBaseName(stem || "image");
      resetCrop();
      setPngChunks([]);
      setExifRecord(null);
      setMetadataLoaded(false);
      setMetadataError(null);
      if (!options?.keepTempHint) {
        setTempSaveHint(null);
        setCharSaveHint(null);
      }
      clearProcessedPreview();
      setSidebarTab(options?.sidebarTab ?? (options?.folderNavigate ? "more" : "edit"));
      setWdTaggerSnapshot(null);
    },
    [previewUrl, rawOriginalUrl, resetCrop, clearProcessedPreview],
  );

  const onPickFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      folderBrowse.clearSelection();
      lastFolderSyncPathRef.current = null;
      loadImageFile(file);
    },
    [loadImageFile, folderBrowse.clearSelection],
  );

  const loadImageFileRef = useRef(loadImageFile);
  loadImageFileRef.current = loadImageFile;
  const resolveCurrentFileRef = useRef(folderBrowse.resolveCurrentFile);
  resolveCurrentFileRef.current = folderBrowse.resolveCurrentFile;

  useEffect(() => {
    const path = folderBrowse.current?.relativePath ?? null;
    if (!path) return;
    if (lastFolderSyncPathRef.current === path) return;
    // 先钉住路径，避免 resolve 过程中重渲染再次进入
    lastFolderSyncPathRef.current = path;
    let cancelled = false;
    const seq = path;
    void (async () => {
      try {
        const resolved = await resolveCurrentFileRef.current();
        if (cancelled || !resolved || resolved.path !== seq) return;
        loadImageFileRef.current(resolved.file, {
          sidebarTab: "more",
          keepTempHint: true,
          folderNavigate: true,
        });
      } catch {
        if (!cancelled && lastFolderSyncPathRef.current === seq) {
          lastFolderSyncPathRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderBrowse.current?.relativePath]);

  const applyRestoredSession = useCallback(
    (data: RestoredToolboxSession) => {
      const { settings } = data;
      setTempDupDialog(null);
      setError(null);
      setTempSaveHint(null);
      setCharSaveHint(null);
      setMetadataLoaded(false);
      setMetadataError(null);
      setPngChunks([]);
      setExifRecord(null);
      clearProcessedPreview();

      setPreviewUrl((prev) => {
        if (prev && prev !== data.previewUrl) revokeUrl(prev);
        return data.previewUrl;
      });
      setRawOriginalUrl((prev) => {
        const next = data.rawOriginalUrl ?? data.previewUrl;
        if (prev && prev !== next && prev !== data.previewUrl) revokeUrl(prev);
        return next;
      });
      setOriginalFile(data.originalFile);
      setBaseName(settings.baseName);
      setFormat(settings.format);
      setQuality(settings.quality);
      setMaxWidth(settings.maxWidth);
      setMaxHeight(settings.maxHeight);
      setCropEnabled(settings.cropEnabled);
      setCropRect(settings.cropRect);
      setWatermarkText(settings.watermarkText);
      setWatermarkOpacity(settings.watermarkOpacity);
      setExportMetaMode(settings.exportMetaMode);
      setColorAdjust(settings.colorAdjust);
      setCompareEnabled(settings.compareEnabled);
      setCircularAvatar(settings.circularAvatar);
      setRoundedCorners(settings.roundedCorners);
      setRoundedCornerPx(settings.roundedCornerPx);
      setSidebarTab(settings.sidebarTab);
      setWdTaggerSnapshot(data.wdTagger);
    },
    [clearProcessedPreview, setCropRect],
  );

  const { tryRestoreSession, clearSession } = useToolboxSessionPersist({
    persistEnabled: hydrateReady,
    snapshot: {
      previewUrl,
      rawOriginalUrl,
      originalFile,
      baseName,
      format,
      quality,
      maxWidth,
      maxHeight,
      cropEnabled,
      cropRect,
      watermarkText,
      watermarkOpacity,
      exportMetaMode,
      colorAdjust,
      compareEnabled,
      circularAvatar,
      roundedCorners,
      roundedCornerPx,
      sidebarTab,
      wdTaggerSnapshot,
    },
    onRestored: applyRestoredSession,
    onRestoreHint: setSessionRestoreHint,
  });

  const tryRestoreSessionRef = useRef(tryRestoreSession);
  tryRestoreSessionRef.current = tryRestoreSession;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab !== "edit" && tab !== "tagger" && tab !== "more") return;
    setSidebarTab(tab);
    params.delete("tab");
    const q = params.toString();
    const path = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state ?? {}, "", q ? `${path}?${q}` : path);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const handoffId = getToolboxHandoffIdFromUrlOrSession();
      if (handoffId) {
        try {
          const data = await peekToolboxHandoffOnce(handoffId);
          if (cancelled) return;
          if (!data) {
            setError("未能载入从临时插画传来的图片，请返回临时插画页重新发送。");
          } else {
            const file = handoffFileFromConsumed(data);
            loadImageFileRef.current(file, { sidebarTab: "tagger", keepTempHint: true });
            setTempSaveHint("已从临时插画载入，可在「标签反推」页签使用 WD14。");
            setSessionRestoreHint(null);
            setWdTaggerSnapshot(null);
            scheduleFinalizeToolboxHandoff(handoffId);
            const params = new URLSearchParams(window.location.search);
            params.delete("handoff");
            const q = params.toString();
            const path = `${window.location.pathname}${window.location.hash}`;
            window.history.replaceState(window.history.state ?? {}, "", q ? `${path}?${q}` : path);
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "载入临时插画传递的图片失败");
          }
        }
      } else {
        await tryRestoreSessionRef.current();
      }
      if (!cancelled) setHydrateReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearWorkbenchSession = useCallback(async () => {
    if (previewUrl) revokeUrl(previewUrl);
    if (rawOriginalUrl && rawOriginalUrl !== previewUrl) revokeUrl(rawOriginalUrl);
    await clearSession();
    setPreviewUrl(null);
    setRawOriginalUrl(null);
    setOriginalFile(null);
    setBaseName("image");
    resetCrop();
    setCropEnabled(false);
    setFormat("image/jpeg");
    setQuality(0.88);
    setMaxWidth("");
    setMaxHeight("");
    setWatermarkText("");
    setWatermarkOpacity(0.72);
    setExportMetaMode("share");
    setColorAdjust({ ...DEFAULT_COLOR_ADJUST });
    setBatchFiles([]);
    setCompareEnabled(false);
    setCircularAvatar(false);
    setRoundedCorners(false);
    setRoundedCornerPx(24);
    setSidebarTab("edit");
    setPngChunks([]);
    setExifRecord(null);
    setMetadataLoaded(false);
    setMetadataError(null);
    setTempSaveHint(null);
    setCharSaveHint(null);
    setTempDupDialog(null);
    setSessionRestoreHint(null);
    setWdTaggerSnapshot(null);
    clearProcessedPreview();
    setError(null);
  }, [
    previewUrl,
    rawOriginalUrl,
    clearSession,
    resetCrop,
    clearProcessedPreview,
  ]);

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
      const mimeType = originalFile.type || "application/octet-stream";
      await saveTempIllustrationFromBlob({
        title: baseName,
        mimeType,
        sdRaw,
        imageBlob: originalFile,
        filename:
          originalFile.name ||
          `${baseName}${mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : ".jpg"}`,
      });
      setTempSaveHint(
        sdRaw?.trim()
          ? "已保存，并已附带生成参数（SD / ComfyUI）。打开「临时插画」点击缩略图即可查看。"
          : "已保存。未检测到 SD / ComfyUI 参数；仍可点击图片查看原图。",
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

  const saveToCharacterEncyclopedia = useCallback(async () => {
    if (!originalFile || charSaveBusy) return;
    setCharSaveBusy(true);
    setCharSaveHint(null);
    try {
      await saveCharacterFromBlob(originalFile);
      setCharSaveHint("已存入人物百科（名称与提示词为空，可稍后编辑）。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存到人物百科失败");
    } finally {
      setCharSaveBusy(false);
    }
  }, [originalFile, charSaveBusy]);

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
      <FolderBrowseNoticeToast notice={folderBrowse.notice} onDismiss={folderBrowse.dismissNotice} />
      <header className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl dark:text-gray-50">
              图片工具箱
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-gray-600 md:text-sm dark:text-gray-400">
              本地处理图片：左侧实时预览，右侧分栏操作。动漫提示词请用
              <strong className="font-medium text-emerald-800 dark:text-emerald-300">「标签反推」</strong>
              （WD14 / Danbooru 标签）。
            </p>
          </div>
        </div>
      </header>

      {sessionRestoreHint ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <span>{sessionRestoreHint}</span>
          <button
            type="button"
            onClick={() => void clearWorkbenchSession()}
            className="shrink-0 rounded-md border border-sky-300 bg-white px-2.5 py-1 font-medium text-sky-900 hover:bg-sky-50 dark:border-sky-700 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
          >
            清除已保存的编辑
          </button>
        </div>
      ) : null}

      {!previewUrl ? (
        <section
          className="rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white/80 p-8 text-center sm:p-12 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-zinc-950/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="mx-auto max-w-lg space-y-6">
            <div>
              <p className="text-base font-medium text-gray-800 dark:text-gray-100">拖拽或选择一张图片</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                全部在浏览器本地处理，不会上传到服务器
                {!hydrateReady ? " · 正在检查本机是否有上次的编辑…" : " · 离开页面后会自动保存当前编辑"}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700">
              选择图片
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
            </label>
            <ul className="grid gap-2 text-left text-xs text-gray-600 sm:grid-cols-3 dark:text-gray-400">
              <li className="rounded-lg border border-gray-200/80 bg-white/80 px-3 py-2 dark:border-gray-700 dark:bg-zinc-900/60">
                <span className="font-medium text-gray-800 dark:text-gray-200">编辑导出</span>
                <br />
                裁剪、压缩、水印
              </li>
              <li className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <span className="font-medium text-emerald-900 dark:text-emerald-200">WD14 标签</span>
                <br />
                动漫 Danbooru 提示词
              </li>
              <li className="rounded-lg border border-gray-200/80 bg-white/80 px-3 py-2 dark:border-gray-700 dark:bg-zinc-900/60">
                <span className="font-medium text-gray-800 dark:text-gray-200">SD 元数据</span>
                <br />
                读取 / 去除 parameters
              </li>
            </ul>
          </div>
        </section>
      ) : null}

      {!previewUrl ? (
        <div className="mt-6 space-y-4">
          <ImageToolboxFolderBrowsePanel browse={folderBrowse} />
          <ImageToolboxPngFolderConvertPanel />
        </div>
      ) : null}

      {previewUrl ? (
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
            folderBrowse={
              folderBrowse.active && folderBrowse.current
                ? {
                    caption: `${folderBrowse.index + 1}/${folderBrowse.kept.length} · ${folderBrowse.current.relativePath}`,
                    canNavigate: folderBrowse.kept.length > 1,
                    onPrev: folderBrowse.goPrev,
                    onNext: folderBrowse.goNext,
                  }
                : null
            }
          />

          <ImageToolboxSidebar
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            fileName={originalFile?.name ?? null}
            busy={busy}
            onExport={handleExport}
            editPane={
              <>
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
                  hideDownloadButton
                />
              </>
            }
            taggerPane={
              <WdTaggerPanel
                imageFile={originalFile}
                persistedSnapshot={wdTaggerSnapshot}
                onPersistedSnapshotChange={setWdTaggerSnapshot}
              />
            }
            morePane={
              <>
                <ImageToolboxFolderBrowsePanel browse={folderBrowse} compact />
                <ImageToolboxPngFolderConvertPanel compact />
                <ImageToolboxMetadataExportPanel
                  originalFile={originalFile}
                  baseName={baseName}
                  hasDetectedMetadata={
                    metadataLoaded &&
                    (pngChunks.length > 0 || Boolean(exifRecord && Object.keys(exifRecord).length > 0))
                  }
                />
                <ImageToolboxTempIllustrationPanel
                  disabled={!originalFile || Boolean(tempDupDialog)}
                  busy={tempSaveBusy}
                  hint={tempSaveHint}
                  onSave={saveToTempIllustration}
                />
                <ImageToolboxCharacterPanel
                  disabled={!originalFile}
                  busy={charSaveBusy}
                  hint={charSaveHint}
                  onSave={saveToCharacterEncyclopedia}
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
                <ToolboxAuxAiPanel imageFile={originalFile} />
              </>
            }
          />
        </div>
      ) : null}

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

    </div>
  );
}
