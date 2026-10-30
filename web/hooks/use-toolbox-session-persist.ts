import type { ToolboxSidebarTab } from "@/components/toolbox/image-toolbox-sidebar";
import type { ColorAdjust, ExportFormat, NormalizedRect } from "@/lib/image-toolbox";
import {
  blobFromObjectUrl,
  clearToolboxSession,
  fileFromSessionBlob,
  loadToolboxSession,
  saveToolboxSession,
  type ToolboxSessionSettings,
} from "@/lib/toolbox-session-db";
import type { WdTaggerPersistedSnapshot } from "@/lib/wd-tagger-session";
import { useCallback, useEffect, useRef } from "react";

export type ToolboxPersistSnapshot = {
  previewUrl: string | null;
  rawOriginalUrl: string | null;
  originalFile: File | null;
  baseName: string;
  format: ExportFormat;
  quality: number;
  maxWidth: string;
  maxHeight: string;
  cropEnabled: boolean;
  cropRect: NormalizedRect;
  watermarkText: string;
  watermarkOpacity: number;
  exportMetaMode: "share" | "archive";
  colorAdjust: ColorAdjust;
  compareEnabled: boolean;
  circularAvatar: boolean;
  roundedCorners: boolean;
  roundedCornerPx: number;
  sidebarTab: ToolboxSidebarTab;
  wdTaggerSnapshot: WdTaggerPersistedSnapshot | null;
};

export type RestoredToolboxSession = {
  previewUrl: string;
  rawOriginalUrl: string | null;
  originalFile: File;
  settings: ToolboxSessionSettings;
  wdTagger: WdTaggerPersistedSnapshot | null;
};

type Args = {
  snapshot: ToolboxPersistSnapshot;
  /** 为 true 后才允许自动保存（完成首屏恢复或 handoff 后） */
  persistEnabled: boolean;
  onRestored: (data: RestoredToolboxSession) => void;
  onRestoreHint: (message: string | null) => void;
};

function buildSettings(s: ToolboxPersistSnapshot): ToolboxSessionSettings {
  const fileName = s.originalFile?.name ?? `${s.baseName || "image"}.png`;
  return {
    baseName: s.baseName,
    fileName,
    format: s.format,
    quality: s.quality,
    maxWidth: s.maxWidth,
    maxHeight: s.maxHeight,
    cropEnabled: s.cropEnabled,
    cropRect: s.cropRect,
    watermarkText: s.watermarkText,
    watermarkOpacity: s.watermarkOpacity,
    exportMetaMode: s.exportMetaMode,
    colorAdjust: s.colorAdjust,
    compareEnabled: s.compareEnabled,
    circularAvatar: s.circularAvatar,
    roundedCorners: s.roundedCorners,
    roundedCornerPx: s.roundedCornerPx,
    sidebarTab: s.sidebarTab,
  };
}

export function useToolboxSessionPersist({
  snapshot,
  persistEnabled,
  onRestored,
  onRestoreHint,
}: Args) {
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const applyRestored = useCallback(
    (session: Awaited<ReturnType<typeof loadToolboxSession>>) => {
      if (!session) return;
      skipNextSaveRef.current = true;
      const { settings } = session;
      const workFile = fileFromSessionBlob(
        session.imageBlob,
        settings.fileName,
        session.mimeType,
      );
      const previewUrl = URL.createObjectURL(session.imageBlob);
      let rawOriginalUrl: string | null = null;
      let originalFile = workFile;
      if (session.originalBlob) {
        rawOriginalUrl = URL.createObjectURL(session.originalBlob);
        originalFile = fileFromSessionBlob(
          session.originalBlob,
          settings.fileName,
          session.originalBlob.type || session.mimeType,
        );
      }
      onRestored({
        previewUrl,
        rawOriginalUrl,
        originalFile,
        settings,
        wdTagger: session.wdTagger,
      });
      onRestoreHint(
        session.wdTagger
          ? "已恢复上次在工具箱中的编辑与 WD14 标签反推结果（保存在本机浏览器）。"
          : "已恢复上次在工具箱中的编辑（保存在本机浏览器）。",
      );
    },
    [onRestored, onRestoreHint],
  );

  const tryRestoreSession = useCallback(async (): Promise<boolean> => {
    const session = await loadToolboxSession();
    if (!session) return false;
    applyRestored(session);
    return true;
  }, [applyRestored]);

  const clearSession = useCallback(async () => {
    skipNextSaveRef.current = true;
    await clearToolboxSession();
    onRestoreHint(null);
  }, [onRestoreHint]);

  useEffect(() => {
    if (!persistEnabled) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!snapshot.previewUrl) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (savingRef.current) return;
      const s = snapshotRef.current;
      if (!s.previewUrl) return;
      savingRef.current = true;
      void (async () => {
        try {
          const imageBlob = await blobFromObjectUrl(s.previewUrl!);
          let originalBlob: Blob | null = null;
          if (s.rawOriginalUrl && s.rawOriginalUrl !== s.previewUrl) {
            originalBlob = await blobFromObjectUrl(s.rawOriginalUrl);
          }
          const settings = buildSettings(s);
          await saveToolboxSession({
            imageBlob,
            originalBlob,
            mimeType: imageBlob.type || s.originalFile?.type || "image/png",
            settings,
            wdTagger: s.wdTaggerSnapshot,
          });
        } catch {
          /* 静默：不影响编辑 */
        } finally {
          savingRef.current = false;
        }
      })();
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    persistEnabled,
    snapshot.previewUrl,
    snapshot.rawOriginalUrl,
    snapshot.originalFile,
    snapshot.baseName,
    snapshot.format,
    snapshot.quality,
    snapshot.maxWidth,
    snapshot.maxHeight,
    snapshot.cropEnabled,
    snapshot.cropRect,
    snapshot.watermarkText,
    snapshot.watermarkOpacity,
    snapshot.exportMetaMode,
    snapshot.colorAdjust,
    snapshot.compareEnabled,
    snapshot.circularAvatar,
    snapshot.roundedCorners,
    snapshot.roundedCornerPx,
    snapshot.sidebarTab,
    snapshot.wdTaggerSnapshot,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { tryRestoreSession, clearSession };
}
