"use client";

import { CharacterCoverImage } from "@/components/character/character-cover-image";
import { CharacterEditorModal } from "@/components/character/character-editor-modal";
import { useCharacterEntries } from "@/hooks/use-character-entries";
import {
  buildAndDownloadZip,
  characterImageZipParts,
  zipFilenameWithDate,
} from "@/lib/gallery-zip-export";
import { characterHasImage, type CharacterEntry } from "@/lib/character-types";
import { useEffect, useMemo, useRef, useState } from "react";

export function CharacterEncyclopedia() {
  const { items, ready, error, refresh } = useCharacterEntries();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CharacterEntry | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const exportHintClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const withImage = useMemo(() => items.filter(characterHasImage), [items]);

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
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-emerald-50/80 via-emerald-50/40 to-zinc-50/80 dark:from-emerald-950/40 dark:via-zinc-950/50 dark:to-zinc-950">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 rounded-2xl border border-emerald-200/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm dark:border-emerald-900/45 dark:bg-zinc-900/85 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
                  人物百科
                </h1>
                {ready && withImage.length > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    {withImage.length} 人已配图
                  </span>
                ) : null}
                {ready && items.length > withImage.length ? (
                  <span className="text-xs text-amber-700 dark:text-amber-400/90">
                    {items.length - withImage.length} 人未配图（不出现在网格中）
                  </span>
                ) : null}
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                在空白格添加人物卡片：图片存储在 MinIO，姓名、提示词与对象键保存在服务端 SQLite。浏览与编辑需 ML API 可用。
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[13rem]">
              <button
                type="button"
                disabled={!ready || !withImage.length || exportBusy}
                onClick={() => void runExportAllZip()}
                className="inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 xl:w-auto xl:min-w-[12rem]"
              >
                {exportBusy ? "下载并打包中…" : "导出全部人物图 ZIP"}
              </button>
              <p className="text-center text-[11px] leading-snug text-gray-500 lg:text-left dark:text-gray-500">
                仅打包已上传图片的人物；需能访问 ML 预签名与 MinIO。
              </p>
            </div>
          </div>
        </header>

        {exportHint ? (
          <div
            role="status"
            aria-live="polite"
            className={`mb-6 rounded-xl border px-4 py-3 text-sm leading-snug ${
              exportHint.startsWith("已打包")
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "border-red-200 bg-red-50/90 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            {exportHint}
          </div>
        ) : null}

        {!ready ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">正在拉取人物列表…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-8 text-center dark:border-red-900/40 dark:bg-red-950/30">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
            {withImage.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-white text-left shadow-sm transition hover:border-emerald-400/80 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:hover:border-emerald-600"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100 dark:bg-zinc-950">
                    <CharacterCoverImage entry={c} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-8">
                      <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    </div>
                    <span className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                      编辑
                    </span>
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="line-clamp-2 font-mono text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                      {c.prompt ? (
                        c.prompt
                      ) : (
                        <span className="italic text-gray-400 dark:text-gray-500">暂无提示词</span>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={openCreate}
                className="flex min-h-[11rem] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300/80 bg-white/70 px-3 py-8 text-center shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50/90 dark:border-emerald-800 dark:bg-zinc-900/50 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/35 sm:min-h-[12.5rem]"
              >
                <span className="text-3xl font-light leading-none text-emerald-600 dark:text-emerald-400">+</span>
                <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">添加人物</span>
                <span className="max-w-[8rem] text-[11px] leading-snug text-gray-500 dark:text-gray-500">在弹窗中填写姓名、提示词并上传图片</span>
              </button>
            </li>
          </ul>
        )}
      </main>

      <CharacterEditorModal
        open={modalOpen}
        entry={editing}
        onClose={closeModal}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
