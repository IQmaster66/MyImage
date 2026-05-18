"use client";

import {
  newPromptEntry,
  parseTagsInput,
  PROMPT_KIND_LABELS,
  type PromptEntry,
  type PromptKind,
} from "@/lib/prompts-types";
import { putPrompt } from "@/lib/prompts-db";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  /** 有 id 为编辑；新建时为 null */
  entry: PromptEntry | null;
  defaultTitle?: string;
  defaultBody?: string;
  defaultKind?: PromptKind;
  onClose: () => void;
  onSaved: () => void;
};

export function PromptEditorModal({
  open,
  entry,
  defaultTitle = "",
  defaultBody = "",
  defaultKind = "positive",
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PromptKind>("positive");
  const [tagsStr, setTagsStr] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (entry) {
      setTitle(entry.title);
      setBody(entry.body);
      setKind(entry.kind);
      setTagsStr(entry.tags.join(", "));
      setFavorited(entry.favorited);
    } else {
      setTitle(defaultTitle || "未命名片段");
      setBody(defaultBody);
      setKind(defaultKind);
      setTagsStr("");
      setFavorited(false);
    }
  }, [open, entry, defaultTitle, defaultBody, defaultKind]);

  if (!open) return null;

  const handleSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      const tags = parseTagsInput(tagsStr);
      if (entry) {
        await putPrompt({
          ...entry,
          title: title.trim() || "未命名",
          body,
          kind,
          tags,
          favorited,
          updatedAt: Date.now(),
        });
      } else {
        const row = newPromptEntry({
          title: title.trim() || "未命名",
          body,
          kind,
          tags,
          favorited,
        });
        await putPrompt(row);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-[121] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 id="prompt-editor-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {entry ? "编辑片段" : "新建片段"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            标题
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            类型
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PromptKind)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            >
              {(Object.keys(PROMPT_KIND_LABELS) as PromptKind[]).map((k) => (
                <option key={k} value={k}>
                  {PROMPT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            标签（逗号分隔）
            <input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="例如：人物, 光影"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            正文
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={favorited}
              onChange={(e) => setFavorited(e.target.checked)}
              className="rounded border-gray-400 text-emerald-600"
            />
            加入收藏
          </label>
          {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={() => void handleSave()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
