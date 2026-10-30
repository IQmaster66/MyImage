import type { ToolboxSidebarTab } from "@/components/toolbox/image-toolbox-sidebar";
import type { ColorAdjust, ExportFormat, NormalizedRect } from "@/lib/image-toolbox";
import { parseWdTaggerSnapshot, type WdTaggerPersistedSnapshot } from "@/lib/wd-tagger-session";

const DB_NAME = "myimage-toolbox-session";
const DB_VERSION = 1;
const STORE = "session";
const SESSION_KEY = "current";

/** 单张工作图超过此大小则不写入 IndexedDB（仍会尝试保存设置到 localStorage） */
export const TOOLBOX_SESSION_MAX_IMAGE_BYTES = 48 * 1024 * 1024;

const SETTINGS_KEY = "myimage-toolbox-session-settings";

export type ToolboxSessionSettings = {
  baseName: string;
  fileName: string;
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
};

export type ToolboxSessionRecord = {
  id: typeof SESSION_KEY;
  imageBlob: Blob;
  /** 与当前预览不同时保留，用于对比原图 / 归档导出 */
  originalBlob: Blob | null;
  mimeType: string;
  settings: ToolboxSessionSettings;
  /** WD14 标签反推结果（与当前工作图指纹一致时恢复） */
  wdTagger: WdTaggerPersistedSnapshot | null;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function blobFromObjectUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读取 blob URL 失败：${res.status}`);
  return res.blob();
}

function isNormalizedRect(v: unknown): v is NormalizedRect {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.nx === "number" &&
    typeof o.ny === "number" &&
    typeof o.nw === "number" &&
    typeof o.nh === "number"
  );
}

function isColorAdjust(v: unknown): v is ColorAdjust {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.brightness === "number" &&
    typeof o.contrast === "number" &&
    typeof o.saturate === "number" &&
    typeof o.hueRotateDeg === "number" &&
    typeof o.grayscale === "boolean"
  );
}

const EXPORT_FORMATS = new Set<ExportFormat>(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const SIDEBAR_TABS = new Set<ToolboxSidebarTab>(["edit", "tagger", "more"]);

export function parseToolboxSessionSettings(raw: unknown): ToolboxSessionSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.baseName !== "string" || typeof o.fileName !== "string") return null;
  if (!EXPORT_FORMATS.has(o.format as ExportFormat)) return null;
  if (typeof o.quality !== "number" || !isNormalizedRect(o.cropRect) || !isColorAdjust(o.colorAdjust)) {
    return null;
  }
  if (o.exportMetaMode !== "share" && o.exportMetaMode !== "archive") return null;
  if (!SIDEBAR_TABS.has(o.sidebarTab as ToolboxSidebarTab)) return null;
  return {
    baseName: o.baseName,
    fileName: o.fileName,
    format: o.format as ExportFormat,
    quality: o.quality,
    maxWidth: typeof o.maxWidth === "string" ? o.maxWidth : "",
    maxHeight: typeof o.maxHeight === "string" ? o.maxHeight : "",
    cropEnabled: Boolean(o.cropEnabled),
    cropRect: o.cropRect as NormalizedRect,
    watermarkText: typeof o.watermarkText === "string" ? o.watermarkText : "",
    watermarkOpacity: typeof o.watermarkOpacity === "number" ? o.watermarkOpacity : 0.72,
    exportMetaMode: o.exportMetaMode,
    colorAdjust: o.colorAdjust as ColorAdjust,
    compareEnabled: Boolean(o.compareEnabled),
    circularAvatar: Boolean(o.circularAvatar),
    roundedCorners: Boolean(o.roundedCorners),
    roundedCornerPx: typeof o.roundedCornerPx === "number" ? o.roundedCornerPx : 24,
    sidebarTab: o.sidebarTab as ToolboxSidebarTab,
  };
}

export function saveToolboxSessionSettingsOnly(settings: ToolboxSessionSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings, updatedAt: Date.now() }));
  } catch {
    /* quota */
  }
}

export function loadToolboxSessionSettingsOnly(): ToolboxSessionSettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { settings?: unknown };
    return parseToolboxSessionSettings(o.settings);
  } catch {
    return null;
  }
}

export async function saveToolboxSession(
  record: Omit<ToolboxSessionRecord, "id" | "updatedAt"> & { wdTagger?: WdTaggerPersistedSnapshot | null },
): Promise<void> {
  const wdTagger = record.wdTagger ?? null;
  if (typeof indexedDB === "undefined") return;
  if (record.imageBlob.size > TOOLBOX_SESSION_MAX_IMAGE_BYTES) {
    saveToolboxSessionSettingsOnly(record.settings);
    return;
  }
  const db = await openDb();
  const row: ToolboxSessionRecord = {
    id: SESSION_KEY,
    imageBlob: record.imageBlob,
    originalBlob: record.originalBlob,
    mimeType: record.mimeType,
    settings: record.settings,
    wdTagger,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      saveToolboxSessionSettingsOnly(record.settings);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
}

export async function loadToolboxSession(): Promise<ToolboxSessionRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(SESSION_KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as ToolboxSessionRecord | undefined;
      if (!row?.imageBlob) {
        resolve(null);
        return;
      }
      const settings = parseToolboxSessionSettings(row.settings);
      if (!settings) {
        resolve(null);
        return;
      }
      const wdTagger = row.wdTagger ? parseWdTaggerSnapshot(row.wdTagger) : null;
      resolve({ ...row, settings, wdTagger });
    };
  });
}

export async function clearToolboxSession(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      /* ignore */
    }
  }
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(SESSION_KEY);
  });
}

export function fileFromSessionBlob(blob: Blob, fileName: string, mimeType: string): File {
  const type = mimeType || blob.type || "application/octet-stream";
  return new File([blob], fileName || "image.png", { type });
}
