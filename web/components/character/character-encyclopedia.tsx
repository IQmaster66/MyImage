"use client";

import { CharacterBatchComboPanel } from "@/components/character/character-batch-combo-panel";
import { CharacterCoverImage } from "@/components/character/character-cover-image";
import { CharacterEditorModal } from "@/components/character/character-editor-modal";
import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { useCharacterEntries } from "@/hooks/use-character-entries";
import { useCharacterSources } from "@/hooks/use-character-sources";
import {
  buildAndDownloadZip,
  characterImageZipParts,
  zipFilenameWithDate,
} from "@/lib/gallery-zip-export";
import {
  characterHasImage,
  formatSourcePath,
  getSourceDescendantIds,
  UNCATEGORIZED_SOURCE_ID,
  type CharacterEntry,
} from "@/lib/character-types";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export function CharacterEncyclopedia() {
  const searchParams = useSearchParams();
  const { items, ready, error, refresh } = useCharacterEntries();
  const { sources, refresh: refreshSources } = useCharacterSources();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CharacterEntry | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const exportHintClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyHintClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceFilter = useMemo(() => {
    const raw = searchParams.get("source");
    if (raw === null) return undefined;
    if (raw === "uncategorized") return UNCATEGORIZED_SOURCE_ID;
    return raw;
  }, [searchParams]);

  const sourceFilterLabel = useMemo(() => {
    if (sourceFilter === undefined) return null;
    if (sourceFilter === UNCATEGORIZED_SOURCE_ID) return "未归类";
    return formatSourcePath(sources, sourceFilter) || "未知来源";
  }, [sourceFilter, sources]);

  const filteredItems = useMemo(() => {
    if (sourceFilter === undefined) return items;
    if (sourceFilter === UNCATEGORIZED_SOURCE_ID) {
      return items.filter((c) => !c.sourceId?.trim());
    }
    const ids = new Set(getSourceDescendantIds(sources, sourceFilter));
    return items.filter((c) => ids.has(c.sourceId));
  }, [items, sourceFilter, sources]);

  const withImage = useMemo(() => filteredItems.filter(characterHasImage), [filteredItems]);
  const allWithImageCount = useMemo(() => items.filter(characterHasImage).length, [items]);

  /** 全库同名（trim 后）出现超过 1 次则视为重复；空名彼此也算 */
  const duplicateNameKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of items) {
      const key = c.name.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dup = new Set<string>();
    for (const [key, n] of counts) {
      if (n > 1) dup.add(key);
    }
    return dup;
  }, [items]);

  const defaultSourceId =
    sourceFilter !== undefined && sourceFilter !== UNCATEGORIZED_SOURCE_ID
      ? sourceFilter
      : UNCATEGORIZED_SOURCE_ID;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (e: CharacterEntry) => {
    setEditing(e);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const flashExportHint = (msg: string) => {
    if (exportHintClearRef.current) clearTimeout(exportHintClearRef.current);
    setExportHint(msg);
    exportHintClearRef.current = setTimeout(() => {
      setExportHint(null);
      exportHintClearRef.current = null;
    }, 4500);
  };

  const flashCopyHint = (msg: string) => {
    if (copyHintClearRef.current) clearTimeout(copyHintClearRef.current);
    setCopyHint(msg);
    copyHintClearRef.current = setTimeout(() => {
      setCopyHint(null);
      copyHintClearRef.current = null;
    }, 2800);
  };

  const runExportAllZip = async () => {
    if (!withImage.length || exportBusy) return;
    setExportBusy(true);
    setExportHint(null);
    try {
      const parts = await characterImageZipParts(withImage);
      await buildAndDownloadZip(parts, zipFilenameWithDate("人物百科导出"));
      flashExportHint(`已打包下载 ${withImage.length} 张人物图片`);
    } catch (e) {
      setExportHint(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (exportHintClearRef.current) clearTimeout(exportHintClearRef.current);
      if (copyHintClearRef.current) clearTimeout(copyHintClearRef.current);
    };
  }, []);

  const onSaved = () => {
    void refresh();
    void refreshSources();
  };

  const batchScopeLabel = sourceFilterLabel
    ? `当前出自 · ${sourceFilterLabel}`
    : "全部人物";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <CopyFeedbackToast message={copyHint ?? exportHint} />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {!ready ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  正在拉取人物列表…
                </p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-8 text-center dark:border-red-900/40 dark:bg-red-950/30">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {withImage.map((c) => {
                  const nameKey = c.name.trim();
                  const isDuplicateName = duplicateNameKeys.has(nameKey);
                  return (
                    <li key={c.id}>
                      <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 shadow-sm transition hover:border-emerald-400/80 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-emerald-600">
                        <button
                          type="button"
                          aria-label={`编辑人物 ${nameKey || "未命名"}${isDuplicateName ? "（名称重复）" : ""}`}
                          onClick={() => openEdit(c)}
                          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                        />
                        <div className="pointer-events-none absolute inset-0 z-[1]">
                          <CharacterCoverImage
                            entry={c}
                            enablePromptCopyOverlay
                            onCopyFeedback={flashCopyHint}
                          />
                        </div>
                        {isDuplicateName ? (
                          <span
                            className="pointer-events-none absolute top-1.5 right-1.5 z-[3] rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-sm ring-1 ring-black/10"
                            title="人物名称与其他条目重复"
                          >
                            重复
                          </span>
                        ) : null}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/75 to-transparent px-2 pt-8 pb-2">
                          <p className="truncate text-sm font-medium text-white">
                            {nameKey || "未命名"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300/80 bg-white/70 px-3 text-center shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50/90 dark:border-emerald-800 dark:bg-zinc-900/50 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/35"
                  >
                    <span className="text-3xl leading-none font-light text-emerald-600 dark:text-emerald-400">
                      +
                    </span>
                    <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                      添加人物
                    </span>
                  </button>
                </li>
              </ul>
            )}
          </div>

          <CharacterBatchComboPanel
            characters={filteredItems}
            scopeLabel={batchScopeLabel}
            withImageCount={withImage.length}
            allWithImageCount={allWithImageCount}
            zipBusy={exportBusy}
            onExportZip={() => void runExportAllZip()}
            onImagesChanged={() => void refresh()}
          />
        </div>
      </main>

      <CharacterEditorModal
        open={modalOpen}
        entry={editing}
        defaultSourceId={defaultSourceId}
        onClose={closeModal}
        onSaved={onSaved}
      />
    </div>
  );
}
