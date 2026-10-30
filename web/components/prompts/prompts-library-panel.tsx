"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { PromptConfirmDialog } from "@/components/prompts/prompt-confirm-dialog";
import { PromptEditorModal } from "@/components/prompts/prompt-editor-modal";
import { PromptPreviewModal } from "@/components/prompts/prompt-preview-modal";
import { PromptsWorkbenchPanel } from "@/components/prompts/prompts-workbench-panel";
import { usePromptCategories } from "@/hooks/use-prompt-categories";
import { usePromptEntries } from "@/hooks/use-prompt-entries";
import {
  allTags,
  deletePrompt,
  exportPromptsJson,
  exportPromptsMarkdown,
  getAllPrompts,
  importPromptsJson,
  putPrompt,
  subscribePromptsChanged,
} from "@/lib/prompts-db";
import { appendToWorkbench } from "@/lib/prompts-draft";
import { tryDeletePromptPreviewKey } from "@/lib/prompt-preview-image";
import {
  entryHasPromptPreview,
  formatCategoryPath,
  getDescendantIds,
  PROMPT_KIND_LABELS,
  UNCATEGORIZED_ID,
  type PromptEntry,
  type PromptKind,
} from "@/lib/prompts-types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  favoritedOnly?: boolean;
  title: string;
  description?: string;
  /** 启用侧栏分类筛选 */
  enableCategoryFilter?: boolean;
  /** 顶部嵌入正/负向工作台 */
  showWorkbench?: boolean;
};

export function PromptsLibraryPanel({
  favoritedOnly,
  title,
  description,
  enableCategoryFilter = false,
  showWorkbench = false,
}: Props) {
  const searchParams = useSearchParams();
  const { categories } = usePromptCategories();

  const categoryFilter = useMemo(() => {
    if (!enableCategoryFilter) return undefined;
    const raw = searchParams.get("category");
    if (raw === null) return undefined;
    if (raw === "uncategorized") return UNCATEGORIZED_ID;
    return raw;
  }, [enableCategoryFilter, searchParams]);

  const activeCategoryName = useMemo(() => {
    if (categoryFilter === undefined) return null;
    if (categoryFilter === UNCATEGORIZED_ID) return "未分类";
    return formatCategoryPath(categories, categoryFilter) || "未知分类";
  }, [categoryFilter, categories]);

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PromptKind | "">("");
  const [tag, setTag] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<PromptEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PromptEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => {
    const base = {
      search: search.trim() || undefined,
      kind: kind || undefined,
      tag: tag || undefined,
      favorited: favoritedOnly ? true : undefined,
    };
    if (categoryFilter === undefined) return base;
    if (categoryFilter === UNCATEGORIZED_ID) {
      return { ...base, categoryId: UNCATEGORIZED_ID };
    }
    return {
      ...base,
      categoryIds: getDescendantIds(categories, categoryFilter),
    };
  }, [search, kind, tag, favoritedOnly, categoryFilter, categories]);

  const { items, ready, error, refresh } = usePromptEntries(query);

  const loadTags = useCallback(async () => {
    const all = await getAllPrompts();
    setTagOptions(allTags(all));
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  useEffect(() => subscribePromptsChanged(() => void loadTags()), [loadTags]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setEditorOpen(true);
  };

  const openEdit = (e: PromptEntry) => {
    setEditing(e);
    setCreating(false);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await tryDeletePromptPreviewKey(pendingDelete.previewImageKey);
      await deletePrompt(pendingDelete.id);
      setPendingDelete(null);
      await refresh();
      await loadTags();
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleFavorite = async (e: PromptEntry) => {
    await putPrompt({ ...e, favorited: !e.favorited, updatedAt: Date.now() });
    await refresh();
  };

  const downloadTextFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportJson = async () => {
    const json = await exportPromptsJson();
    downloadTextFile(
      json,
      `prompts-export-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json;charset=utf-8",
    );
  };

  const handleExportMarkdown = async () => {
    const md = await exportPromptsMarkdown();
    downloadTextFile(
      md,
      `prompts-export-${new Date().toISOString().slice(0, 10)}.md`,
      "text/markdown;charset=utf-8",
    );
  };

  const onImportFile = async (f: File | undefined) => {
    if (!f) return;
    setImportMsg(null);
    try {
      const text = await f.text();
      const { added, skipped } = await importPromptsJson(text);
      setImportMsg(`已导入 ${added} 条，跳过 ${skipped} 条。`);
      await refresh();
      await loadTags();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "导入失败");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const flashCopy = (msg: string) => {
    setCopyHint(msg);
    window.setTimeout(() => setCopyHint(null), 3200);
  };

  const defaultCategoryId =
    categoryFilter !== undefined ? categoryFilter : UNCATEGORIZED_ID;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      {showWorkbench ? (
        <div className="mb-6">
          <PromptsWorkbenchPanel />
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl dark:text-gray-50">
            {title}
            {activeCategoryName ? (
              <span className="ml-2 text-base font-normal text-emerald-700 dark:text-emerald-300">
                · {activeCategoryName}
              </span>
            ) : null}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        {!favoritedOnly ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-between">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              新建片段
            </button>
            <div
              className="inline-flex h-9 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-800"
              role="group"
              aria-label="词库导入导出"
            >
              <label className="inline-flex h-full cursor-pointer items-center px-3 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-700">
                导入 JSON
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => void onImportFile(e.target.files?.[0])}
                />
              </label>
              <span className="w-px self-stretch bg-gray-200 dark:bg-zinc-600" aria-hidden />
              <button
                type="button"
                onClick={() => void handleExportJson()}
                className="inline-flex h-full items-center px-3 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-zinc-700"
              >
                导出 JSON
              </button>
              <span className="w-px self-stretch bg-gray-200 dark:bg-zinc-600" aria-hidden />
              <button
                type="button"
                onClick={() => void handleExportMarkdown()}
                className="inline-flex h-full items-center px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                title="按分类树导出美观 Markdown，便于阅读与复制"
              >
                导出 MD
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">在词库中可为片段勾选「加入收藏」</p>
        )}
      </div>

      {importMsg ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          {importMsg}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white/90 p-3 dark:border-gray-700 dark:bg-zinc-900/80 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[12rem] flex-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          搜索
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="标题或正文"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>
        <label className="block w-full text-xs font-medium text-gray-600 sm:w-36 dark:text-gray-400">
          类型
          <select
            value={kind}
            onChange={(e) => setKind((e.target.value || "") as PromptKind | "")}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          >
            <option value="">全部</option>
            {(Object.keys(PROMPT_KIND_LABELS) as PromptKind[]).map((k) => (
              <option key={k} value={k}>
                {PROMPT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block w-full text-xs font-medium text-gray-600 sm:w-36 dark:text-gray-400">
          标签
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          >
            <option value="">全部</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CopyFeedbackToast message={copyHint} />

      {!ready ? (
        <p className="mt-8 text-center text-sm text-gray-500">加载中…</p>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-red-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {favoritedOnly
            ? "暂无收藏。在词库中编辑片段并勾选收藏。"
            : activeCategoryName
              ? `「${activeCategoryName}」下暂无片段，可点击「新建片段」。`
              : "暂无片段，点击「新建片段」或导入 JSON。"}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((e) => {
            const catLabel = e.categoryId
              ? formatCategoryPath(categories, e.categoryId) || "未知分类"
              : "未分类";
            return (
              <li
                key={e.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-zinc-900/90"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{e.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="text-emerald-700 dark:text-emerald-400">{catLabel}</span>
                      {" · "}
                      {PROMPT_KIND_LABELS[e.kind]}
                      {e.tags.length ? ` · ${e.tags.join("、")}` : ""}
                      <span className="ml-2 tabular-nums text-gray-400">
                        {new Date(e.updatedAt).toLocaleString("zh-CN")}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {showWorkbench ? (
                      <>
                        <button
                          type="button"
                          title="追加到正面提示词"
                          onClick={() => appendToWorkbench("positive", e.body)}
                          className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          → 正向
                        </button>
                        <button
                          type="button"
                          title="追加到负面提示词"
                          onClick={() => appendToWorkbench("negative", e.body)}
                          className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-200"
                        >
                          → 负向
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      title="收藏"
                      aria-label={e.favorited ? "取消收藏" : "收藏"}
                      onClick={() => void toggleFavorite(e)}
                      className={`rounded px-2 py-1 text-xs ${
                        e.favorited
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-400"
                      }`}
                    >
                      {e.favorited ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(e.body).then((ok) => flashCopy(ok ? "已复制正文" : "复制失败"))}
                      className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
                    >
                      复制正文
                    </button>
                    <button
                      type="button"
                      title={entryHasPromptPreview(e) ? "查看效果预览" : "暂无效果图，可在编辑中导入"}
                      onClick={() => setPreviewing(e)}
                      className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-800 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-200"
                    >
                      预览
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(e)}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-2 font-mono text-[11px] text-gray-800 dark:bg-zinc-950 dark:text-gray-200">
                  {e.body}
                </pre>
              </li>
            );
          })}
        </ul>
      )}

      <PromptConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `删除「${pendingDelete.title}」？` : "删除片段？"}
        description="这条提示词会从服务端词库中移除，无法撤销。"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setPendingDelete(null)}
        onConfirm={handleDelete}
      />

      <PromptPreviewModal
        open={previewing !== null}
        entry={previewing}
        onClose={() => setPreviewing(null)}
      />

      <PromptEditorModal
        open={editorOpen && (creating || editing !== null)}
        entry={creating ? null : editing}
        defaultTitle={creating ? "未命名片段" : undefined}
        defaultBody=""
        defaultKind="positive"
        defaultCategoryId={defaultCategoryId}
        onClose={closeEditor}
        onSaved={() => void refresh().then(() => loadTags())}
      />
    </main>
  );
}
