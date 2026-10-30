"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { PromptEditorModal } from "@/components/prompts/prompt-editor-modal";
import {
  appendToWorkbench,
  loadWorkbenchDraft,
  loadWorkbenchLayout,
  saveWorkbenchDraft,
  saveWorkbenchLayout,
  WORKBENCH_APPEND_EVENT,
  type WorkbenchAppendDetail,
} from "@/lib/prompts-draft";
import type { PromptKind } from "@/lib/prompts-types";
import { translatePromptText } from "@/lib/wd-prompt-translate";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const DRAFT_DEBOUNCE_MS = 500;
const MIN_BOX = 72;
const MAX_BOX = 480;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function joinAppend(existing: string, chunk: string): string {
  const t = chunk.trim();
  if (!t) return existing;
  const base = existing.trimEnd();
  if (!base) return t;
  const needsComma = /,\s*$/.test(base) || t.startsWith(",");
  return needsComma ? `${base} ${t.replace(/^,\s*/, "")}` : `${base}, ${t}`;
}

type Props = {
  /** 默认折叠（收藏页可不展开） */
  defaultCollapsed?: boolean;
};

export function PromptsWorkbenchPanel({ defaultCollapsed = false }: Props) {
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [posH, setPosH] = useState(140);
  const [negH, setNegH] = useState(100);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [translating, setTranslating] = useState<"positive" | "negative" | null>(null);

  const [pickOpen, setPickOpen] = useState(false);
  const [saveSource, setSaveSource] = useState<"positive" | "negative" | "both">("positive");
  const [saveTitle, setSaveTitle] = useState("从工作台保存");
  const [editorOpen, setEditorOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    title: string;
    body: string;
    kind: PromptKind;
  } | null>(null);

  const dragRef = useRef<{
    which: "positive" | "negative" | "split";
    startY: number;
    startPosH: number;
    startNegH: number;
  } | null>(null);
  const translateBusyRef = useRef(false);

  useEffect(() => {
    const d = loadWorkbenchDraft();
    if (d) {
      setPositive(d.positive);
      setNegative(d.negative);
    }
    const layout = loadWorkbenchLayout();
    setPosH(layout.positiveHeight);
    setNegH(layout.negativeHeight);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      saveWorkbenchDraft({ positive, negative });
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [positive, negative]);

  useEffect(() => {
    saveWorkbenchLayout({ positiveHeight: posH, negativeHeight: negH });
  }, [posH, negH]);

  useEffect(() => {
    const onAppend = (ev: Event) => {
      const detail = (ev as CustomEvent<WorkbenchAppendDetail>).detail;
      if (!detail?.text?.trim()) return;
      setCollapsed(false);
      if (detail.target === "positive") {
        setPositive((prev) => joinAppend(prev, detail.text));
      } else {
        setNegative((prev) => joinAppend(prev, detail.text));
      }
      setCopyHint(detail.target === "positive" ? "已追加到正向" : "已追加到负向");
      window.setTimeout(() => setCopyHint(null), 2800);
    };
    window.addEventListener(WORKBENCH_APPEND_EVENT, onAppend);
    return () => window.removeEventListener(WORKBENCH_APPEND_EVENT, onAppend);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      if (d.which === "positive") {
        setPosH(Math.min(MAX_BOX, Math.max(MIN_BOX, d.startPosH + dy)));
      } else if (d.which === "negative") {
        setNegH(Math.min(MAX_BOX, Math.max(MIN_BOX, d.startNegH + dy)));
      } else {
        // 中间分隔：上减下加 / 上加下减
        const nextPos = Math.min(MAX_BOX, Math.max(MIN_BOX, d.startPosH + dy));
        const nextNeg = Math.min(MAX_BOX, Math.max(MIN_BOX, d.startNegH - dy));
        setPosH(nextPos);
        setNegH(nextNeg);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const startDrag = useCallback(
    (which: "positive" | "negative" | "split", e: ReactPointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        which,
        startY: e.clientY,
        startPosH: posH,
        startNegH: negH,
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [posH, negH],
  );

  const flash = (msg: string) => {
    setCopyHint(msg);
    window.setTimeout(() => setCopyHint(null), 3200);
  };

  const runTranslate = useCallback(
    async (target: "positive" | "negative", direction: "zh2en" | "en2zh") => {
      const src = (target === "positive" ? positive : negative).trim();
      if (!src || translateBusyRef.current) return;
      translateBusyRef.current = true;
      setTranslating(target);
      try {
        const out = await translatePromptText(src, direction);
        if (!out.trim()) {
          flash("翻译结果为空");
          return;
        }
        if (target === "positive") setPositive(out);
        else setNegative(out);
        flash(direction === "zh2en" ? "已译为英文" : "已译为中文");
      } catch (e) {
        flash(e instanceof Error ? e.message : "翻译失败（请确认 ML API 已启动）");
      } finally {
        translateBusyRef.current = false;
        setTranslating(null);
      }
    },
    [positive, negative],
  );

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

  return (
    <section className="rounded-xl border border-emerald-200/80 bg-white/95 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900/90">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 px-3 py-2 dark:border-emerald-900/40">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">工作台</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            正面 / 负面可拖拽调高；草稿自动保存。词库条目可一键追加。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            {collapsed ? "展开" : "折叠"}
          </button>
          {!collapsed ? (
            <>
              <button
                type="button"
                onClick={() => void copyText(positive).then((ok) => flash(ok ? "已复制正向" : "复制失败"))}
                disabled={!positive.trim()}
                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] disabled:opacity-40 dark:border-zinc-600 dark:text-gray-300"
              >
                复制正向
              </button>
              <button
                type="button"
                onClick={() => void copyText(negative).then((ok) => flash(ok ? "已复制负向" : "复制失败"))}
                disabled={!negative.trim()}
                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] disabled:opacity-40 dark:border-zinc-600 dark:text-gray-300"
              >
                复制负向
              </button>
              <button
                type="button"
                onClick={openPickSave}
                disabled={!positive.trim() && !negative.trim()}
                className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                存入词库
              </button>
              <button
                type="button"
                onClick={() => {
                  setPositive("");
                  setNegative("");
                }}
                className="rounded-md px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                清空
              </button>
            </>
          ) : null}
        </div>
      </div>

      <CopyFeedbackToast message={copyHint} />

      {!collapsed ? (
        <div className="space-y-0 p-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="wb-positive" className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                正面提示词
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-gray-400">{positive.length} 字</span>
                <button
                  type="button"
                  disabled={!positive.trim() || translating !== null}
                  onClick={() => void runTranslate("positive", "zh2en")}
                  className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                  title="中文 → English（覆盖当前框）"
                >
                  {translating === "positive" ? "翻译中…" : "中→英"}
                </button>
                <button
                  type="button"
                  disabled={!positive.trim() || translating !== null}
                  onClick={() => void runTranslate("positive", "en2zh")}
                  className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                  title="English → 中文（覆盖当前框）"
                >
                  英→中
                </button>
              </div>
            </div>
            <textarea
              id="wb-positive"
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
              placeholder="描述画面内容… 也可从下方词库点「→ 正向」追加"
              style={{ height: posH }}
              className="w-full resize-none rounded-lg border border-emerald-200/80 bg-white px-3 py-2 font-mono text-sm leading-relaxed dark:border-emerald-900/50 dark:bg-zinc-950 dark:text-gray-100"
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="拖拽调整正面框高度"
              onPointerDown={(e) => startDrag("positive", e)}
              className="group flex h-2 cursor-row-resize items-center justify-center"
            >
              <span className="h-0.5 w-10 rounded-full bg-gray-300 group-hover:bg-emerald-500 dark:bg-zinc-600" />
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="拖拽调整正负向比例"
            onPointerDown={(e) => startDrag("split", e)}
            className="my-0.5 flex h-3 cursor-row-resize items-center justify-center rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title="拖拽调整正 / 负比例"
          >
            <span className="h-1 w-14 rounded-full bg-emerald-400/70 dark:bg-emerald-600/70" />
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="wb-negative" className="text-xs font-medium text-rose-800 dark:text-rose-300">
                负面提示词
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-gray-400">{negative.length} 字</span>
                <button
                  type="button"
                  disabled={!negative.trim() || translating !== null}
                  onClick={() => void runTranslate("negative", "zh2en")}
                  className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                  title="中文 → English（覆盖当前框）"
                >
                  {translating === "negative" ? "翻译中…" : "中→英"}
                </button>
                <button
                  type="button"
                  disabled={!negative.trim() || translating !== null}
                  onClick={() => void runTranslate("negative", "en2zh")}
                  className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                  title="English → 中文（覆盖当前框）"
                >
                  英→中
                </button>
              </div>
            </div>
            <textarea
              id="wb-negative"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              placeholder="不想出现的内容… 也可从词库点「→ 负向」追加"
              style={{ height: negH }}
              className="w-full resize-none rounded-lg border border-rose-200/70 bg-white px-3 py-2 font-mono text-sm leading-relaxed dark:border-rose-900/40 dark:bg-zinc-950 dark:text-gray-100"
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="拖拽调整负面框高度"
              onPointerDown={(e) => startDrag("negative", e)}
              className="group flex h-2 cursor-row-resize items-center justify-center"
            >
              <span className="h-0.5 w-10 rounded-full bg-gray-300 group-hover:bg-rose-400 dark:bg-zinc-600" />
            </div>
          </div>
        </div>
      ) : null}

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
                继续（编辑分类等）
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
        onClose={() => {
          setEditorOpen(false);
          setCreateDefaults(null);
        }}
        onSaved={() => {
          setEditorOpen(false);
          setCreateDefaults(null);
        }}
      />
    </section>
  );
}

/** 供词库卡片调用，避免循环依赖时可从 draft 直接 import */
export { appendToWorkbench };
