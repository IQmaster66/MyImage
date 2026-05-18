"use client";

import { CopyStatusBanner } from "@/components/copy-status-banner";
import { PromptEditorModal } from "@/components/prompts/prompt-editor-modal";
import { getAllPrompts, subscribePromptsChanged } from "@/lib/prompts-db";
import { loadWorkbenchDraft, saveWorkbenchDraft } from "@/lib/prompts-draft";
import type { PromptKind } from "@/lib/prompts-types";
import { useCallback, useEffect, useState } from "react";

const DRAFT_DEBOUNCE_MS = 500;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PromptsWorkbench() {
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [count, setCount] = useState(0);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const [pickOpen, setPickOpen] = useState(false);
  const [saveSource, setSaveSource] = useState<"positive" | "negative" | "both">("positive");
  const [saveTitle, setSaveTitle] = useState("从工作台保存");

  const [editorOpen, setEditorOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    title: string;
    body: string;
    kind: PromptKind;
  } | null>(null);

  const refreshCount = useCallback(async () => {
    const all = await getAllPrompts();
    setCount(all.length);
  }, []);

  useEffect(() => {
    const d = loadWorkbenchDraft();
    if (d) {
      setPositive(d.positive);
      setNegative(d.negative);
    }
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => subscribePromptsChanged(() => void refreshCount()), [refreshCount]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      saveWorkbenchDraft({ positive, negative });
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [positive, negative]);

  const flash = (msg: string) => {
    setCopyHint(msg);
    window.setTimeout(() => setCopyHint(null), 3200);
  };

  const bodyForSave = (): string => {
    if (saveSource === "positive") return positive;
    if (saveSource === "negative") return negative;
    return [positive.trim(), negative.trim()].filter(Boolean).join("\n\n");
  };

  const kindForSave = (): PromptKind => {
    if (saveSource === "positive") return "positive";
    if (saveSource === "negative") return "negative";
    return positive.trim() && negative.trim() ? "full" : positive.trim() ? "positive" : "negative";
  };

  const openPickSave = () => {
    if (!positive.trim() && !negative.trim()) return;
    setSaveTitle("从工作台保存");
    setSaveSource("positive");
    setPickOpen(true);
  };

  const continueToEditor = () => {
    const body = bodyForSave().trim();
    if (!body) return;
    setCreateDefaults({
      title: saveTitle.trim() || "从工作台保存",
      body,
      kind: kindForSave(),
    });
    setPickOpen(false);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setCreateDefaults(null);
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl dark:text-gray-50">
            工作台
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            草稿每 {DRAFT_DEBOUNCE_MS / 1000}s 自动保存到本机浏览器。当前词库共{" "}
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{count}</span> 条。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyText(positive).then((ok) => flash(ok ? "已复制正向" : "复制失败"))}
            disabled={!positive.trim()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100"
          >
            复制正向
          </button>
          <button
            type="button"
            onClick={() => void copyText(negative).then((ok) => flash(ok ? "已复制负向" : "复制失败"))}
            disabled={!negative.trim()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100"
          >
            复制负向
          </button>
          <button
            type="button"
            onClick={openPickSave}
            disabled={!positive.trim() && !negative.trim()}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            保存到词库…
          </button>
        </div>
      </div>

      {copyHint ? (
        <div className="mt-3">
          <CopyStatusBanner message={copyHint} />
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          正向提示词
          <textarea
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            rows={8}
            placeholder="描述画面内容…"
            className="mt-1 w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          负向提示词
          <textarea
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            rows={6}
            placeholder="不想出现的内容…"
            className="mt-1 w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
          />
        </label>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        可与「工具箱」里 SD 参数卡联动：后续在此增加「从当前解析结果写入工作台」按钮即可。当前请用「保存到词库」写入分类词库。
      </p>

      {pickOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pick-save-title"
        >
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="关闭" onClick={() => setPickOpen(false)} />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-zinc-900">
            <h2 id="pick-save-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              保存到词库
            </h2>
            <label className="mt-3 block text-xs text-gray-600 dark:text-gray-400">
              标题
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
              />
            </label>
            <fieldset className="mt-3">
              <legend className="text-xs text-gray-600 dark:text-gray-400">保存正文来源</legend>
              <div className="mt-2 flex flex-col gap-2 text-sm text-gray-800 dark:text-gray-200">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="saveSrc"
                    checked={saveSource === "positive"}
                    onChange={() => setSaveSource("positive")}
                  />
                  仅正向
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="saveSrc"
                    checked={saveSource === "negative"}
                    onChange={() => setSaveSource("negative")}
                  />
                  仅负向
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="saveSrc"
                    checked={saveSource === "both"}
                    onChange={() => setSaveSource("both")}
                  />
                  正向 + 负向（两段之间空行）
                </label>
              </div>
            </fieldset>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!bodyForSave().trim()}
                onClick={continueToEditor}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                继续（编辑标签等）
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PromptEditorModal
        open={editorOpen}
        entry={null}
        defaultTitle={createDefaults?.title ?? "未命名片段"}
        defaultBody={createDefaults?.body ?? ""}
        defaultKind={createDefaults?.kind ?? "positive"}
        onClose={closeEditor}
        onSaved={() => void refreshCount()}
      />
    </main>
  );
}
