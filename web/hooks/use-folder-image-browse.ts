"use client";

import {
  DEFAULT_FOLDER_BROWSE_SORT,
  downloadRemainingFolderZip,
  ensureFolderEntryFile,
  imageEntriesFromWebkitFileList,
  pickFolderImageEntries,
  sortFolderImageEntries,
  supportsDirectoryPicker,
  type FolderBrowseSortBy,
  type FolderBrowseSortDir,
  type FolderBrowseSortMode,
  type FolderImageEntry,
} from "@/lib/folder-image-browse";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type FolderBrowseNotice = {
  tone: "success" | "info" | "warn" | "error";
  title: string;
  detail?: string;
};

export function useFolderImageBrowse(options?: {
  /** 有剩余图片时启用全局 ←→ / Delete（焦点不在输入框时） */
  enableHotkeys?: boolean;
}) {
  const enableHotkeys = options?.enableHotkeys !== false;

  const [entries, setEntries] = useState<FolderImageEntry[]>([]);
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(() => new Set());
  const [folderLabel, setFolderLabel] = useState("");
  const [index, setIndex] = useState(0);
  const [sortMode, setSortModeState] = useState<FolderBrowseSortMode>(DEFAULT_FOLDER_BROWSE_SORT);
  const [busy, setBusy] = useState(false);
  /** 原生选择：路径已列出，mtime 仍在后台补齐 */
  const [metaHydrating, setMetaHydrating] = useState(false);
  const [metaProgress, setMetaProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<FolderBrowseNotice | null>(null);
  const [supportsPicker, setSupportsPicker] = useState(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preservePathRef = useRef<string | null>(null);
  const viewingPathRef = useRef<string | null>(null);
  const pickAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupportsPicker(supportsDirectoryPicker());
  }, []);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  const dismissNotice = useCallback(() => {
    clearNoticeTimer();
    setNotice(null);
  }, [clearNoticeTimer]);

  const showNotice = useCallback(
    (next: FolderBrowseNotice, autoMs = 4200) => {
      clearNoticeTimer();
      setNotice(next);
      if (next.tone === "error") return;
      noticeTimerRef.current = setTimeout(() => {
        setNotice(null);
        noticeTimerRef.current = null;
      }, autoMs);
    },
    [clearNoticeTimer],
  );

  useEffect(() => () => clearNoticeTimer(), [clearNoticeTimer]);

  useEffect(() => {
    return () => {
      pickAbortRef.current?.abort();
    };
  }, []);

  const kept = useMemo(() => {
    const filtered = entries.filter((e) => !removedPaths.has(e.relativePath));
    return sortFolderImageEntries(filtered, sortMode);
  }, [entries, removedPaths, sortMode]);

  const safeIndex = kept.length ? Math.min(index, kept.length - 1) : 0;
  const current = kept.length ? kept[safeIndex]! : null;
  const active = entries.length > 0;
  viewingPathRef.current = current?.relativePath ?? null;

  useEffect(() => {
    const path = preservePathRef.current ?? viewingPathRef.current;
    if (preservePathRef.current) {
      preservePathRef.current = null;
    }
    if (path && kept.length) {
      const i = kept.findIndex((e) => e.relativePath === path);
      if (i >= 0) {
        if (i !== index) setIndex(i);
        return;
      }
    }
    if (kept.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    if (index >= kept.length) setIndex(kept.length - 1);
  }, [kept, index]);

  const setSortBy = useCallback(
    (by: FolderBrowseSortBy) => {
      preservePathRef.current = current?.relativePath ?? null;
      startTransition(() => {
        setSortModeState((prev) => (prev.by === by ? prev : { ...prev, by }));
      });
      if (by === "date" && metaHydrating) {
        showNotice(
          {
            tone: "info",
            title: "正在读取修改时间",
            detail: "日期排序会随后台扫描逐渐准确；名称排序可立刻使用。",
          },
          2800,
        );
      }
    },
    [current?.relativePath, metaHydrating, showNotice],
  );

  const setSortDir = useCallback(
    (dir: FolderBrowseSortDir) => {
      preservePathRef.current = current?.relativePath ?? null;
      startTransition(() => {
        setSortModeState((prev) => (prev.dir === dir ? prev : { ...prev, dir }));
      });
    },
    [current?.relativePath],
  );

  const clearSelection = useCallback(() => {
    pickAbortRef.current?.abort();
    pickAbortRef.current = null;
    setEntries([]);
    setRemovedPaths(new Set());
    setFolderLabel("");
    setIndex(0);
    setSortModeState(DEFAULT_FOLDER_BROWSE_SORT);
    setMetaHydrating(false);
    setMetaProgress(null);
    dismissNotice();
  }, [dismissNotice]);

  const pickNativeFolder = useCallback(async () => {
    dismissNotice();
    pickAbortRef.current?.abort();
    const ac = new AbortController();
    pickAbortRef.current = ac;
    setMetaHydrating(false);
    setMetaProgress(null);

    try {
      let listedOnce = false;
      const { dirName, entries: list } = await pickFolderImageEntries({
        signal: ac.signal,
        onListed: (partial, name) => {
          listedOnce = true;
          setMetaHydrating(true);
          setMetaProgress({ done: 0, total: partial.length });
          // 立刻可按名称浏览，不必等全部 getFile
          setEntries(partial.slice());
          setRemovedPaths(new Set());
          setFolderLabel(name);
          setIndex(0);
          if (!partial.length) {
            showNotice({
              tone: "warn",
              title: "未找到可用图片",
              detail: `「${name}」及其子目录中没有 jpg / png / webp 等常见格式。`,
            });
          } else {
            showNotice({
              tone: "success",
              title: `已列出 ${partial.length} 张`,
              detail: "可立即按名称浏览；修改时间在后台读取，完成后日期排序更准。",
              },
              3600,
            );
          }
        },
        onProgress: (p) => {
          if (p.phase === "meta") {
            setMetaProgress({ done: p.metaDone, total: p.metaTotal });
            // 周期性刷新 lastModified；钉住当前正在看的路径，避免日期重排把 index 指到别的图
            if (p.metaDone === p.metaTotal || p.metaDone % 24 === 0) {
              preservePathRef.current = viewingPathRef.current;
              setEntries((prev) => prev.slice());
            }
          }
        },
      });

      if (ac.signal.aborted) return;

      preservePathRef.current = viewingPathRef.current;
      setEntries(list.slice());
      setMetaHydrating(false);
      setMetaProgress(null);
      if (!listedOnce) {
        setRemovedPaths(new Set());
        setFolderLabel(dirName);
        setIndex(0);
      }
      if (list.length) {
        showNotice(
          {
            tone: "success",
            title: `就绪 · ${list.length} 张`,
            detail: "修改时间已读完，名称 / 日期排序均可使用。",
          },
          2800,
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMetaHydrating(false);
      setMetaProgress(null);
      showNotice({
        tone: "error",
        title: "选择文件夹失败",
        detail: e instanceof Error ? e.message : "请重试或改用「兼容选择」",
      });
    } finally {
      if (pickAbortRef.current === ac) pickAbortRef.current = null;
    }
  }, [dismissNotice, showNotice]);

  const onCompatFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      dismissNotice();
      pickAbortRef.current?.abort();
      setMetaHydrating(false);
      setMetaProgress(null);
      const next = imageEntriesFromWebkitFileList(list);
      setEntries(next);
      setRemovedPaths(new Set());
      const top = next[0]?.relativePath.split(/[/\\]/)[0] ?? "文件夹";
      setFolderLabel(top);
      setIndex(0);
      if (!next.length) {
        showNotice({
          tone: "warn",
          title: "未找到可用图片",
          detail: "所选内容中没有 jpg / png / webp 等常见格式。",
        });
      } else {
        showNotice({
          tone: "success",
          title: `已载入 ${next.length} 张图片`,
          detail: `来自「${top}」。名称 / 日期排序可立即使用。`,
        });
      }
    },
    [dismissNotice, showNotice],
  );

  const goPrev = useCallback(() => {
    setIndex((i) => (kept.length ? (i - 1 + kept.length) % kept.length : 0));
  }, [kept.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (kept.length ? (i + 1) % kept.length : 0));
  }, [kept.length]);

  const softRemoveCurrent = useCallback(() => {
    if (!current || kept.length === 0) return;
    const path = current.relativePath;
    const name = current.fileName;
    const nextKeptLen = kept.length - 1;
    setRemovedPaths((prev) => {
      const n = new Set(prev);
      n.add(path);
      return n;
    });
    showNotice(
      {
        tone: "info",
        title: "已从列表移除",
        detail: `「${name}」仅移出本次浏览，源文件仍在磁盘。剩余 ${nextKeptLen} 张。`,
      },
      3200,
    );
    setIndex((i) => {
      if (nextKeptLen <= 0) return 0;
      return Math.min(i, nextKeptLen - 1);
    });
  }, [current, kept.length, showNotice]);

  const undoAllRemoved = useCallback(() => {
    setRemovedPaths((prev) => {
      if (!prev.size) return prev;
      const n = prev.size;
      showNotice({
        tone: "success",
        title: "已恢复列表",
        detail: `重新纳入 ${n} 张此前移除的图片。`,
      });
      return new Set();
    });
    setIndex(0);
  }, [showNotice]);

  const exportRemaining = useCallback(async () => {
    if (!kept.length || busy) return;
    setBusy(true);
    dismissNotice();
    try {
      const name = await downloadRemainingFolderZip(kept, folderLabel);
      showNotice(
        {
          tone: "success",
          title: `已导出 ${kept.length} 张`,
          detail: `下载文件：${name}`,
        },
        5600,
      );
    } catch (e) {
      showNotice({
        tone: "error",
        title: "导出失败",
        detail: e instanceof Error ? e.message : "打包 ZIP 时出错",
      });
    } finally {
      setBusy(false);
    }
  }, [kept, busy, folderLabel, dismissNotice, showNotice]);

  /**
   * 供主预览区：解析当前条目 File（懒加载）。
   * 只就地缓存到 entry 上，禁止 setEntries——否则日期排序会因 mtime 更新重排，触发预览 effect 死循环。
   */
  const resolveCurrentFile = useCallback(async (): Promise<{
    path: string;
    file: File;
  } | null> => {
    const cur = kept.length ? kept[Math.min(index, kept.length - 1)] : null;
    if (!cur) return null;
    const path = cur.relativePath;
    const file = await ensureFolderEntryFile(cur);
    return { path, file };
  }, [kept, index]);

  useEffect(() => {
    if (!enableHotkeys || !kept.length) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Delete") {
        e.preventDefault();
        softRemoveCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableHotkeys, kept.length, goPrev, goNext, softRemoveCurrent]);

  const keptBytes = useMemo(() => {
    let s = 0;
    for (const e of kept) {
      if (e.file) s += e.file.size;
    }
    return s;
  }, [kept]);

  const dateSortReady = !metaHydrating && entries.every((e) => e.lastModified > 0 || !e.handle);

  return {
    active,
    entries,
    kept,
    current,
    index: safeIndex,
    folderLabel,
    removedCount: removedPaths.size,
    keptBytes,
    sortMode,
    setSortBy,
    setSortDir,
    metaHydrating,
    metaProgress,
    dateSortReady,
    busy,
    notice,
    dismissNotice,
    supportsPicker,
    clearSelection,
    pickNativeFolder,
    onCompatFiles,
    goPrev,
    goNext,
    softRemoveCurrent,
    undoAllRemoved,
    exportRemaining,
    resolveCurrentFile,
  };
}

export type FolderImageBrowseApi = ReturnType<typeof useFolderImageBrowse>;
