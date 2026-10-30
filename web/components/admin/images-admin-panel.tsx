"use client";

import {
  AdminDeleteAllConfirmDialog,
  type AdminDeleteAllTarget,
} from "@/components/admin/admin-delete-all-confirm";
import { AdminDuplicatesSection } from "@/components/admin/admin-duplicates-section";
import { AdminImageDetailModal } from "@/components/admin/admin-image-detail-modal";
import { AdminMaintenanceSection } from "@/components/admin/admin-maintenance-section";
import { AdminMinioThumb } from "@/components/admin/admin-minio-thumb";
import { CharacterEditorModal } from "@/components/character/character-editor-modal";
import { useCharacterEntries } from "@/hooks/use-character-entries";
import { useTempIllustrationEntries } from "@/hooks/use-temp-illustration-entries";
import {
  buildObjectSizeMap,
  fetchStorageStats,
  formatBytes,
  storagePrefixBytes,
  storagePrefixCount,
  type StorageStats,
} from "@/lib/admin-api";
import { findTempIllustrationDuplicateGroups } from "@/lib/admin-duplicates";
import { adminItemKey, type AdminImageItem, type AdminSelectionKey, type AdminTab } from "@/lib/admin-image-types";
import { deleteAllCharactersApi, deleteCharacterApi } from "@/lib/character-api";
import type { CharacterEntry } from "@/lib/character-types";
import { characterHasImage } from "@/lib/character-types";
import {
  buildAndDownloadZip,
  characterImageZipParts,
  tempIllustrationZipParts,
  zipFilenameWithDate,
} from "@/lib/gallery-zip-export";
import { readImageMetadataFile } from "@/lib/image-metadata";
import { getMlApiBase, getMlHealth } from "@/lib/ml-api";
import { extractStableDiffusionParameters } from "@/lib/sd-parameters";
import {
  deleteAllTempIllustrations,
  deleteTempIllustration,
  saveTempIllustrationFromBlob,
  updateTempIllustration,
} from "@/lib/temp-illustration-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "temp", label: "临时插画" },
  { id: "character", label: "人物百科" },
  { id: "duplicates", label: "重复检测" },
  { id: "maintenance", label: "存储维护" },
];

const GRID_TABS: AdminTab[] = ["all", "temp", "character"];

function buildAdminItems(
  temp: TempIllustrationEntry[],
  characters: CharacterEntry[],
): AdminImageItem[] {
  const rows: AdminImageItem[] = [];
  for (const t of temp) {
    rows.push({
      kind: "temp",
      id: t.id,
      title: t.title || "未命名",
      imageKey: t.imageKey,
      sortAt: t.createdAt,
      mimeType: t.mimeType,
      sdRaw: t.sdRaw,
      contentSha256: t.contentSha256,
    });
  }
  for (const c of characters) {
    if (!characterHasImage(c)) continue;
    rows.push({
      kind: "character",
      id: c.id,
      title: c.name || "未命名",
      imageKey: c.imageKey,
      sortAt: c.updatedAt,
      subtitle: [c.promptClothed, c.promptUnclothed].filter((s) => s.trim()).join(" · ") || undefined,
    });
  }
  rows.sort((a, b) => b.sortAt - a.sortAt);
  return rows;
}

export function ImagesAdminPanel() {
  const {
    items: tempItems,
    ready: tempReady,
    error: tempError,
    refresh: refreshTemp,
  } = useTempIllustrationEntries();
  const {
    items: charItems,
    ready: charReady,
    error: charError,
    refresh: refreshChar,
  } = useCharacterEntries();

  const [tab, setTab] = useState<AdminTab>("all");
  const [query, setQuery] = useState("");
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [detail, setDetail] = useState<AdminImageItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminImageItem | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] = useState<AdminImageItem[] | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState<AdminDeleteAllTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<AdminSelectionKey>>(new Set());
  const [editingCharacter, setEditingCharacter] = useState<CharacterEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allReady = tempReady && charReady;
  const allItems = useMemo(() => buildAdminItems(tempItems, charItems), [tempItems, charItems]);
  const duplicateGroupCount = useMemo(
    () => findTempIllustrationDuplicateGroups(tempItems).length,
    [tempItems],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (tab === "temp" && item.kind !== "temp") return false;
      if (tab === "character" && item.kind !== "character") return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.imageKey.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.sdRaw?.toLowerCase().includes(q)
      );
    });
  }, [allItems, tab, query]);

  const stats = useMemo(
    () => ({
      temp: tempItems.length,
      character: charItems.filter(characterHasImage).length,
      total: allItems.length,
    }),
    [tempItems.length, charItems, allItems.length],
  );

  const objectSizeByKey = useMemo(() => buildObjectSizeMap(storageStats), [storageStats]);

  const tempStorageBytes = storagePrefixBytes(storageStats, "temp-illustrations/");
  const charStorageBytes = storagePrefixBytes(storageStats, "characters/");
  const tempStorageCount = storagePrefixCount(storageStats, "temp-illustrations/");
  const charStorageCount = storagePrefixCount(storageStats, "characters/");

  const filteredStorageBytes = useMemo(() => {
    let sum = 0;
    let known = 0;
    for (const item of filtered) {
      const n = objectSizeByKey.get(item.imageKey);
      if (typeof n === "number") {
        sum += n;
        known += 1;
      }
    }
    return { sum, known, total: filtered.length };
  }, [filtered, objectSizeByKey]);

  const flashHint = useCallback((msg: string) => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setActionHint(msg);
    hintTimerRef.current = setTimeout(() => {
      setActionHint(null);
      hintTimerRef.current = null;
    }, 4500);
  }, []);

  const refreshStorageStats = useCallback(() => {
    void fetchStorageStats()
      .then(setStorageStats)
      .catch(() => setStorageStats(null));
  }, []);

  const refreshAll = useCallback(() => {
    void refreshTemp();
    void refreshChar();
    refreshStorageStats();
    void getMlHealth()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, [refreshTemp, refreshChar, refreshStorageStats]);

  useEffect(() => {
    refreshAll();
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [refreshAll]);

  useEffect(() => {
    if (!selectMode) setSelected(new Set());
  }, [selectMode, tab]);

  const copyObjectKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      flashHint("已复制对象键");
    } catch {
      flashHint("复制失败");
    }
  };

  const deleteItems = async (items: AdminImageItem[]) => {
    for (const item of items) {
      if (item.kind === "temp") await deleteTempIllustration(item.id);
      else await deleteCharacterApi(item.id);
    }
    const keys = new Set(items.map((i) => adminItemKey(i)));
    if (detail && keys.has(adminItemKey(detail))) setDetail(null);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });
  };

  const runDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteItems([pendingDelete]);
      setPendingDelete(null);
      flashHint("已删除");
      refreshAll();
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  const runBatchDelete = async () => {
    if (!pendingBatchDelete?.length) return;
    setDeleteBusy(true);
    try {
      await deleteItems(pendingBatchDelete);
      setPendingBatchDelete(null);
      flashHint(`已删除 ${pendingBatchDelete.length} 项`);
      refreshAll();
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "批量删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteAllCount =
    pendingDeleteAll === "temp"
      ? tempItems.length
      : pendingDeleteAll === "character"
        ? charItems.length
        : 0;

  const runDeleteAll = async () => {
    if (!pendingDeleteAll) return;
    setDeleteBusy(true);
    try {
      if (pendingDeleteAll === "temp") {
        const n = await deleteAllTempIllustrations();
        flashHint(`已删除全部临时插画（${n}）`);
      } else {
        const n = await deleteAllCharactersApi();
        flashHint(`已删除全部人物百科（${n}）`);
      }
      setPendingDeleteAll(null);
      setDetail(null);
      setSelected(new Set());
      refreshAll();
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "全部删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleSelect = (item: AdminImageItem) => {
    const key = adminItemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map(adminItemKey)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selected.has(adminItemKey(i)));

  const selectedItems = useMemo(
    () => filtered.filter((i) => selected.has(adminItemKey(i))),
    [filtered, selected],
  );

  const runExportVisible = async () => {
    if (!filtered.length || exportBusy) return;
    setExportBusy(true);
    try {
      const tempOnly = filtered.filter((i) => i.kind === "temp");
      const charOnly = filtered.filter((i) => i.kind === "character");
      const parts: { pathInZip: string; data: Blob }[] = [];
      if (tempOnly.length) {
        const temps = tempItems.filter((t) => tempOnly.some((f) => f.id === t.id));
        parts.push(...(await tempIllustrationZipParts(temps)));
      }
      if (charOnly.length) {
        const chars = charItems.filter((c) => charOnly.some((f) => f.id === c.id));
        parts.push(...(await characterImageZipParts(chars)));
      }
      if (!parts.length) return;
      await buildAndDownloadZip(parts, zipFilenameWithDate("后台图片导出"));
      flashHint(`已导出 ${parts.length} 个文件`);
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportBusy(false);
    }
  };

  const onUploadFiles = async (files: FileList | null) => {
    if (!files?.length || uploadBusy) return;
    setUploadBusy(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const base = file.name.replace(/\.[^.]+$/, "") || "未命名";
        let sdRaw: string | null = null;
        try {
          const { pngChunks, exif } = await readImageMetadataFile(file);
          sdRaw = extractStableDiffusionParameters(pngChunks, exif);
        } catch {
          /* 无元数据也可上传 */
        }
        await saveTempIllustrationFromBlob({
          title: base,
          mimeType: file.type || "application/octet-stream",
          sdRaw,
          imageBlob: file,
          filename: file.name,
        });
        ok += 1;
      }
      flashHint(ok ? `已上传 ${ok} 张到临时插画` : "未选择有效图片");
      refreshAll();
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveTitleEdit = async (item: AdminImageItem) => {
    const next = titleDraft.trim();
    if (!next || item.kind !== "temp") {
      setEditingTitleId(null);
      return;
    }
    try {
      await updateTempIllustration(item.id, { title: next });
      flashHint("标题已更新");
      setEditingTitleId(null);
      refreshAll();
    } catch (e) {
      flashHint(e instanceof Error ? e.message : "更新失败");
    }
  };

  const openCharacterEditor = (id: string) => {
    const entry = charItems.find((c) => c.id === id);
    if (entry) setEditingCharacter(entry);
  };

  const loadError = tempError || charError;
  const showGrid = GRID_TABS.includes(tab);

  const showUpload = tab === "all" || tab === "temp";
  const showDangerTemp = tab === "all" || tab === "temp";
  const showDangerChar = tab === "all" || tab === "character";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:gap-5 sm:px-6 sm:py-8">
        {/* 页头：标题 + 状态 + 刷新 */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
              后台管理
            </h1>
            <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400">
              临时插画与人物配图 ·{" "}
              <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{getMlApiBase()}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                apiOk === null
                  ? "border-gray-200 bg-gray-50 text-gray-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                  : apiOk
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  apiOk === null ? "bg-gray-400" : apiOk ? "bg-emerald-500" : "bg-red-500"
                }`}
                aria-hidden
              />
              {apiOk === null ? "检测中" : apiOk ? "API 正常" : "API 不可用"}
            </span>
            {duplicateGroupCount > 0 ? (
              <button
                type="button"
                onClick={() => setTab("duplicates")}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
              >
                {duplicateGroupCount} 组重复
              </button>
            ) : null}
            <button
              type="button"
              onClick={refreshAll}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100"
            >
              刷新
            </button>
          </div>
        </header>

        {/* 统计 */}
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/45 dark:bg-emerald-950/35 sm:px-4 sm:py-3">
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">全部（DB）</p>
            <p className="text-xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100 sm:text-2xl">
              {stats.total}
            </p>
            {storageStats ? (
              <p className="mt-0.5 truncate text-[10px] text-emerald-800/90 dark:text-emerald-300/90">
                MinIO 合计 {formatBytes(storageStats.total_bytes)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setTab("temp")}
            className={`rounded-xl border px-3 py-2.5 text-left transition sm:px-4 sm:py-3 ${
              tab === "temp"
                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-500/25 dark:border-emerald-700 dark:bg-emerald-950/50"
                : "border-gray-200 bg-white hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-emerald-800"
            }`}
          >
            <p className="text-[11px] text-gray-500 dark:text-gray-400">临时插画</p>
            <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
              {stats.temp}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
              {storageStats
                ? `${formatBytes(tempStorageBytes)} · MinIO ${tempStorageCount} 个`
                : "体积加载中…"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab("character")}
            className={`rounded-xl border px-3 py-2.5 text-left transition sm:px-4 sm:py-3 ${
              tab === "character"
                ? "border-violet-400 bg-violet-50 ring-2 ring-violet-500/25 dark:border-violet-700 dark:bg-violet-950/50"
                : "border-gray-200 bg-white hover:border-violet-300 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-violet-800"
            }`}
          >
            <p className="text-[11px] text-gray-500 dark:text-gray-400">人物百科</p>
            <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
              {stats.character}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-violet-800 dark:text-violet-300">
              {storageStats
                ? `${formatBytes(charStorageBytes)} · MinIO ${charStorageCount} 个`
                : "体积加载中…"}
            </p>
          </button>
          <div className="rounded-xl border border-sky-200/70 bg-sky-50/70 px-3 py-2.5 dark:border-sky-900/45 dark:bg-sky-950/35 sm:px-4 sm:py-3">
            <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80">MinIO 对象</p>
            {storageStats ? (
              <>
                <p className="text-xl font-semibold tabular-nums text-sky-900 dark:text-sky-100 sm:text-2xl">
                  {storageStats.total_count}
                </p>
                <p className="truncate text-[10px] text-sky-700/90 dark:text-sky-400/90">
                  {formatBytes(storageStats.total_bytes)}
                  {storageStats.db_referenced_count !== storageStats.total_count ? (
                    <span className="ml-1 text-amber-700 dark:text-amber-400">
                      · 未引用 {storageStats.total_count - storageStats.db_referenced_count}
                    </span>
                  ) : null}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>
        </section>
        {storageStats?.by_prefix?.length ? (
          <div className="-mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
            {storageStats.by_prefix.map((p) => {
              const label =
                p.prefix === "temp-illustrations/"
                  ? "临时插画"
                  : p.prefix === "characters/"
                    ? "人物百科"
                    : p.prefix === "prompt-previews/"
                      ? "词库预览"
                      : p.prefix.replace(/\/$/, "");
              return (
                <span
                  key={p.prefix}
                  className="rounded-md border border-gray-100 bg-gray-50 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {label} · {p.count} 张 · {formatBytes(p.bytes)}
                </span>
              );
            })}
          </div>
        ) : null}

        {/* 工具栏：标签 + 搜索 + 列表操作 */}
        <section className="rounded-2xl border border-gray-200/90 bg-white/95 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 sm:p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800"
              role="tablist"
              aria-label="后台分区"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    tab === t.id
                      ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-900 dark:text-emerald-300"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  }`}
                >
                  {t.label}
                  {t.id === "duplicates" && duplicateGroupCount > 0 ? ` (${duplicateGroupCount})` : ""}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {showGrid ? (
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索标题、对象键、提示词…"
                  className="h-9 w-full min-w-[12rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 sm:max-w-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100"
                />
              ) : null}
              {showGrid ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectMode((v) => !v)}
                    className={`h-9 rounded-lg border px-3 text-sm font-medium ${
                      selectMode
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                        : "border-gray-200 bg-white text-gray-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-100"
                    }`}
                  >
                    {selectMode ? "退出多选" : "多选"}
                  </button>
                  {selectMode ? (
                    <>
                      <button
                        type="button"
                        disabled={!filtered.length || allFilteredSelected}
                        onClick={selectAllFiltered}
                        className="h-9 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
                      >
                        全选（{filtered.length}）
                      </button>
                      <button
                        type="button"
                        disabled={!selected.size}
                        onClick={clearSelection}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                      >
                        取消全选
                      </button>
                      <button
                        type="button"
                        disabled={!selected.size}
                        onClick={() => setPendingBatchDelete(selectedItems)}
                        className="h-9 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        删除所选（{selected.size}）
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!filtered.length || exportBusy}
                      onClick={() => void runExportVisible()}
                      className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {exportBusy ? "导出中…" : "导出列表"}
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {showGrid && filtered.length > 0 ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              当前列表 {filtered.length} 张
              {filteredStorageBytes.known > 0 ? (
                <>
                  ，合计占用{" "}
                  <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">
                    {formatBytes(filteredStorageBytes.sum)}
                  </span>
                  {filteredStorageBytes.known < filteredStorageBytes.total
                    ? `（${filteredStorageBytes.known}/${filteredStorageBytes.total} 已知体积）`
                    : null}
                </>
              ) : storageStats === null ? (
                " · 体积加载中…"
              ) : null}
              {selectMode ? (
                <>
                  {" · "}
                  已选{" "}
                  <span className="font-medium tabular-nums text-emerald-800 dark:text-emerald-300">
                    {selected.size}
                  </span>
                  {query.trim() ? "（按当前搜索结果）" : ""}
                </>
              ) : null}
            </p>
          ) : selectMode && showGrid ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              多选中：已选{" "}
              <span className="font-medium tabular-nums text-emerald-800 dark:text-emerald-300">
                {selected.size}
              </span>{" "}
              / {filtered.length}
              {query.trim() ? "（按当前搜索结果全选）" : "（当前列表）"}
            </p>
          ) : null}

          {(showDangerTemp || showDangerChar) && showGrid ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-red-100/80 pt-3 dark:border-red-950/40">
              <span className="text-[11px] font-medium text-red-700/80 dark:text-red-300/80">危险操作</span>
              {showDangerTemp ? (
                <button
                  type="button"
                  disabled={deleteBusy || tempItems.length === 0}
                  onClick={() => setPendingDeleteAll("temp")}
                  className="rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                >
                  清空临时插画（{tempItems.length}）
                </button>
              ) : null}
              {showDangerChar ? (
                <button
                  type="button"
                  disabled={deleteBusy || charItems.length === 0}
                  onClick={() => setPendingDeleteAll("character")}
                  className="rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                >
                  清空人物百科（{charItems.length}）
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {showUpload ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-emerald-300/60 bg-emerald-50/30 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between sm:py-3.5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">上传到临时插画</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                写入 MinIO 与数据库；自动读取 PNG/EXIF 中的 SD 参数
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onUploadFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {uploadBusy ? "上传中…" : "选择图片"}
              </button>
              <Link
                href="/toolbox"
                className="text-sm text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                工具箱
              </Link>
            </div>
          </section>
        ) : null}

        {actionHint ? (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
          >
            {actionHint}
          </p>
        ) : null}

        {tab === "maintenance" ? (
          <AdminMaintenanceSection onHint={flashHint} onChanged={refreshAll} />
        ) : tab === "duplicates" ? (
          !allReady ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-24 text-center text-sm text-gray-500 dark:border-zinc-700">
              加载中…
            </div>
          ) : (
            <AdminDuplicatesSection items={tempItems} onHint={flashHint} onChanged={refreshAll} />
          )
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {tempError ? <p>临时插画：{tempError}</p> : null}
            {charError ? <p className={tempError ? "mt-1" : ""}>人物百科：{charError}</p> : null}
          </div>
        ) : !allReady ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200 py-24 text-sm text-gray-500 dark:border-zinc-700">
            加载图片列表…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-20 text-center text-sm text-gray-500 dark:border-zinc-700 dark:text-gray-400">
            {query.trim() ? "没有匹配的图片" : "暂无图片，请先上传或在前台添加人物。"}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => {
              const key = adminItemKey(item);
              const isSelected = selected.has(key);
              const sizeBytes = objectSizeByKey.get(item.imageKey);
              return (
                <li
                  key={key}
                  className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-900 ${
                    isSelected
                      ? "border-emerald-500 ring-2 ring-emerald-500/30"
                      : "border-gray-200/90 dark:border-zinc-700"
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-zinc-950">
                    {selectMode ? (
                      <label className="absolute inset-0 z-10 flex cursor-pointer items-start justify-end p-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item)}
                          className="h-5 w-5 rounded border-gray-300"
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => !selectMode && setDetail(item)}
                      className="relative h-full w-full"
                    >
                      <AdminMinioThumb imageKey={item.imageKey} alt={item.title} />
                      <span
                        className={`absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                          item.kind === "temp" ? "bg-emerald-700/90" : "bg-violet-700/90"
                        }`}
                      >
                        {item.kind === "temp" ? "临时插画" : "人物"}
                      </span>
                      {typeof sizeBytes === "number" ? (
                        <span className="absolute right-2 bottom-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                          {formatBytes(sizeBytes)}
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    {editingTitleId === item.id && item.kind === "temp" ? (
                      <div className="flex gap-1">
                        <input
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveTitleEdit(item);
                            if (e.key === "Escape") setEditingTitleId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void saveTitleEdit(item)}
                          className="shrink-0 rounded bg-emerald-600 px-2 text-xs text-white"
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                    )}
                    <p className="line-clamp-1 font-mono text-[10px] text-gray-500 dark:text-gray-400" title={item.imageKey}>
                      {item.imageKey}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(item.sortAt).toLocaleString("zh-CN")}
                      {typeof sizeBytes === "number" ? (
                        <span className="ml-1.5 font-medium tabular-nums text-gray-600 dark:text-gray-300">
                          · {formatBytes(sizeBytes)}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => setDetail(item)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
                      >
                        详情
                      </button>
                      {item.kind === "temp" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleId(item.id);
                            setTitleDraft(item.title);
                          }}
                          className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
                        >
                          改标题
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCharacterEditor(item.id)}
                          className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] text-violet-800 hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                        >
                          编辑
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void copyObjectKey(item.imageKey)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-800"
                      >
                        键
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(item)}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>


      <AdminImageDetailModal
        item={detail}
        sizeBytes={detail ? objectSizeByKey.get(detail.imageKey) : null}
        onClose={() => setDetail(null)}
      />

      <CharacterEditorModal
        open={editingCharacter !== null}
        entry={editingCharacter}
        onClose={() => setEditingCharacter(null)}
        onSaved={() => {
          setEditingCharacter(null);
          refreshAll();
        }}
      />

      {pendingDelete ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="取消"
            onClick={() => !deleteBusy && setPendingDelete(null)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">确认删除</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              将删除「{pendingDelete.title}」的数据库记录，并移除 MinIO 对象{" "}
              <span className="break-all font-mono text-xs">{pendingDelete.imageKey}</span>。此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setPendingDelete(null)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void runDelete()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingBatchDelete?.length ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="取消"
            onClick={() => !deleteBusy && setPendingBatchDelete(null)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">确认批量删除</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              将删除 {pendingBatchDelete.length} 项（含数据库记录与 MinIO 对象），不可撤销。
            </p>
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-500">
              {pendingBatchDelete.slice(0, 8).map((i) => (
                <li key={adminItemKey(i)} className="truncate">
                  {i.title}
                </li>
              ))}
              {pendingBatchDelete.length > 8 ? <li>…等共 {pendingBatchDelete.length} 项</li> : null}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setPendingBatchDelete(null)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void runBatchDelete()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminDeleteAllConfirmDialog
        open={pendingDeleteAll !== null}
        target={pendingDeleteAll}
        count={deleteAllCount}
        busy={deleteBusy}
        onCancel={() => setPendingDeleteAll(null)}
        onConfirm={() => void runDeleteAll()}
      />
    </div>
  );
}
