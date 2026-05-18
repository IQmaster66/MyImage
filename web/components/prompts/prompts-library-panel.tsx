"use client";

import { CopyStatusBanner } from "@/components/copy-status-banner";
import { PromptEditorModal } from "@/components/prompts/prompt-editor-modal";
import {
  allTags,
  deletePrompt,
  exportPromptsJson,
  getAllPrompts,
  importPromptsJson,
  putPrompt,
  subscribePromptsChanged,
} from "@/lib/prompts-db";
import { PROMPT_KIND_LABELS, type PromptEntry, type PromptKind } from "@/lib/prompts-types";
import { usePromptEntries } from "@/hooks/use-prompt-entries";
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
};

export function PromptsLibraryPanel({ favoritedOnly, title, description }: Props) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PromptKind | "">("");
  const [tag, setTag] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      kind: kind || undefined,
      tag: tag || undefined,
      favorited: favoritedOnly ? true : undefined,
    }),
    [search, kind, tag, favoritedOnly],
  );

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

  const handleDelete = async (e: PromptEntry) => {
    if (!window.confirm(`确定删除「${e.title}」？`)) return;
    await deletePrompt(e.id);
    await refresh();
    await loadTags();
  };

  const toggleFavorite = async (e: PromptEntry) => {
    await putPrompt({ ...e, favorited: !e.favorited, updatedAt: Date.now() });
    await refresh();
  };

  const handleExport = async () => {
    const json = await exportPromptsJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prompts-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl dark:text-gray-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        {!favoritedOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              新建片段
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
            >
              导出 JSON
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700">
              导入 JSON
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => void onImportFile(e.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">在分类词库中可为片段勾选「加入收藏」</p>
        )}
      </div>

      {importMsg ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          {importMsg}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white/90 p-3 dark:border-gray-700 dark:bg-zinc-900/80 sm:flex-row sm:flex-wrap sm:items-end">
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

      {copyHint ? (
        <div className="mt-3">
          <CopyStatusBanner message={copyHint} />
        </div>
      ) : null}

      {!ready ? (
        <p className="mt-8 text-center text-sm text-gray-500">加载中…</p>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-red-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {favoritedOnly ? "暂无收藏。在分类词库中编辑片段并勾选收藏。" : "暂无片段，点击「新建片段」或导入 JSON。"}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-zinc-900/90"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{e.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {PROMPT_KIND_LABELS[e.kind]}
                    {e.tags.length ? ` · ${e.tags.join("、")}` : ""}
                    <span className="ml-2 tabular-nums text-gray-400">
                      {new Date(e.updatedAt).toLocaleString("zh-CN")}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
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
                    onClick={() => openEdit(e)}
                    className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(e)}
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
          ))}
        </ul>
      )}

      <PromptEditorModal
        open={editorOpen && (creating || editing !== null)}
        entry={creating ? null : editing}
        defaultTitle={creating ? "未命名片段" : undefined}
        defaultBody=""
        defaultKind="positive"
        onClose={closeEditor}
        onSaved={() => void refresh().then(() => loadTags())}
      />
    </main>
  );
}
