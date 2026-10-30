"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMlApiBase, getMlHealth, postCaption, postTranslate } from "@/lib/ml-api";

type Props = {
  imageFile: File | null;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** BLIP 自然语言描述 + 中英文翻译（非 Danbooru 标签） */
export function ToolboxAuxAiPanel({ imageFile }: Props) {
  const apiBase = getMlApiBase();
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [includeZh, setIncludeZh] = useState(true);
  const [captionEn, setCaptionEn] = useState("");
  const [captionZh, setCaptionZh] = useState("");
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionErr, setCaptionErr] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const copyHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [transIn, setTransIn] = useState("");
  const [transDir, setTransDir] = useState<"zh2en" | "en2zh">("en2zh");
  const [transOut, setTransOut] = useState("");
  const [transBusy, setTransBusy] = useState(false);
  const [transErr, setTransErr] = useState<string | null>(null);

  const [mlApiOk, setMlApiOk] = useState<boolean | null>(null);
  const fileForCaption = localFile ?? imageFile;

  useEffect(() => {
    let cancelled = false;
    getMlHealth()
      .then(() => {
        if (!cancelled) setMlApiOk(true);
      })
      .catch(() => {
        if (!cancelled) setMlApiOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runCaption = useCallback(async () => {
    if (!fileForCaption) return;
    setCaptionBusy(true);
    setCaptionErr(null);
    try {
      const r = await postCaption(fileForCaption, { includeZh });
      setCaptionEn(r.caption_en);
      setCaptionZh(r.caption_zh ?? "");
    } catch (e) {
      setCaptionEn("");
      setCaptionZh("");
      setCaptionErr(e instanceof Error ? e.message : "反推失败");
    } finally {
      setCaptionBusy(false);
    }
  }, [fileForCaption, includeZh]);

  const runTranslate = useCallback(async () => {
    const t = transIn.trim();
    if (!t) return;
    setTransBusy(true);
    setTransErr(null);
    try {
      setTransOut(await postTranslate(t, transDir));
    } catch (e) {
      setTransOut("");
      setTransErr(e instanceof Error ? e.message : "翻译失败");
    } finally {
      setTransBusy(false);
    }
  }, [transIn, transDir]);

  const onCopy = async (label: string, text: string) => {
    if (!text) return;
    const ok = await copyText(text);
    if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
    setCopyHint(ok ? `已复制：${label}` : "复制失败");
    copyHintTimerRef.current = setTimeout(() => {
      setCopyHint(null);
      copyHintTimerRef.current = null;
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      {mlApiOk === false ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          需启动 <code className="rounded bg-white/70 px-1 dark:bg-zinc-900">{apiBase}</code> 后可用。
        </p>
      ) : null}

      <details className="rounded-lg border border-gray-100 dark:border-gray-700/80">
        <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
          BLIP 自然语言描述
        </summary>
        <div className="space-y-3 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            生成英文画面描述（句子），不是 Danbooru 标签；动漫图请用「标签反推」页签。
          </p>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-gray-600 dark:bg-gray-800">
            另选图片
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeZh}
              onChange={(e) => setIncludeZh(e.target.checked)}
              className="rounded text-green-600"
            />
            同时翻译成中文
          </label>
          <button
            type="button"
            disabled={!fileForCaption || captionBusy}
            onClick={() => void runCaption()}
            className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-50 dark:bg-gray-700"
          >
            {captionBusy ? "反推中…" : "开始反推"}
          </button>
          {captionErr ? <p className="text-xs text-red-600 dark:text-red-400">{captionErr}</p> : null}
          {captionEn ? (
            <div className="rounded-lg bg-gray-50 p-2 text-sm dark:bg-zinc-950">
              <div className="flex justify-end">
                <button type="button" onClick={() => void onCopy("英文", captionEn)} className="text-xs text-green-700">
                  复制
                </button>
              </div>
              <p className="whitespace-pre-wrap">{captionEn}</p>
              {captionZh ? <p className="mt-2 border-t pt-2 text-gray-600 dark:text-gray-400">{captionZh}</p> : null}
            </div>
          ) : null}
        </div>
      </details>

      <details className="rounded-lg border border-gray-100 dark:border-gray-700/80">
        <summary className="cursor-pointer select-none px-2 py-2 text-sm font-semibold text-gray-900 marker:text-emerald-600 dark:text-gray-100">
          中英文互译
        </summary>
        <div className="space-y-2 border-t border-gray-100 px-2 pb-3 pt-3 dark:border-gray-700/80">
          <select
            value={transDir}
            onChange={(e) => setTransDir(e.target.value as "zh2en" | "en2zh")}
            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="zh2en">中文 → English</option>
            <option value="en2zh">English → 中文</option>
          </select>
          <textarea
            value={transIn}
            onChange={(e) => setTransIn(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
            placeholder="输入要翻译的文本…"
          />
          <button
            type="button"
            disabled={!transIn.trim() || transBusy}
            onClick={() => void runTranslate()}
            className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-700"
          >
            {transBusy ? "翻译中…" : "翻译"}
          </button>
          {transErr ? <p className="text-xs text-red-600">{transErr}</p> : null}
          {transOut ? (
            <div className="rounded-lg bg-gray-50 p-2 text-sm dark:bg-zinc-950">
              <button type="button" onClick={() => void onCopy("译文", transOut)} className="text-xs text-green-700">
                复制
              </button>
              <p className="mt-1 whitespace-pre-wrap">{transOut}</p>
            </div>
          ) : null}
        </div>
      </details>

      <CopyFeedbackToast message={copyHint} />
    </div>
  );
}
