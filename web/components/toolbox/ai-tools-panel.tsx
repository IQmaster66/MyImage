"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/image-toolbox";
import {
  wdTagsToCommaLine,
  wdTagsToCsv,
} from "@/lib/wd-tags-export";
import {
  fetchWdModels,
  getMlApiBase,
  getMlHealth,
  postCaption,
  postTranslate,
  postWdInterrogate,
} from "@/lib/ml-api";

type Props = {
  /** 工具箱当前选中的图片，用于「用当前图反推」 */
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

export function AiToolsPanel({ imageFile }: Props) {
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

  const [wdModels, setWdModels] = useState<string[]>([]);
  const [wdModel, setWdModel] = useState("wd14-convnextv2-v2");
  const [wdThreshold, setWdThreshold] = useState(0.35);
  const [wdBusy, setWdBusy] = useState(false);
  const [wdErr, setWdErr] = useState<string | null>(null);
  const [wdPrompt, setWdPrompt] = useState("");
  const [wdWeighted, setWdWeighted] = useState("");
  const [wdMeta, setWdMeta] = useState<string | null>(null);
  const [wdTags, setWdTags] = useState<Record<string, number>>({});

  const [mlApiOk, setMlApiOk] = useState<boolean | null>(null);
  const [captionHistory, setCaptionHistory] = useState<
    { id: string; t: number; en: string; zh?: string }[]
  >([]);
  const [wdHistory, setWdHistory] = useState<
    { id: string; t: number; prompt: string; weighted: string; model: string; th: number }[]
  >([]);

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

  useEffect(() => {
    let cancelled = false;
    fetchWdModels()
      .then((r) => {
        if (cancelled) return;
        if (r.models?.length) setWdModels(r.models);
        if (r.default && r.models?.includes(r.default)) setWdModel(r.default);
      })
      .catch(() => {
        /* 服务未启动时忽略 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runCaption = useCallback(async () => {
    if (!fileForCaption) return;
    setCaptionBusy(true);
    setCaptionErr(null);
    setCopyHint(null);
    try {
      const r = await postCaption(fileForCaption, { includeZh });
      setCaptionEn(r.caption_en);
      setCaptionZh(r.caption_zh ?? "");
      setCaptionHistory((h) =>
        [
          {
            id: crypto.randomUUID(),
            t: Date.now(),
            en: r.caption_en,
            zh: r.caption_zh ?? undefined,
          },
          ...h,
        ].slice(0, 8),
      );
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
      const out = await postTranslate(t, transDir);
      setTransOut(out);
    } catch (e) {
      setTransOut("");
      setTransErr(e instanceof Error ? e.message : "翻译失败");
    } finally {
      setTransBusy(false);
    }
  }, [transIn, transDir]);

  const runWd = useCallback(async () => {
    if (!fileForCaption) return;
    setWdBusy(true);
    setWdErr(null);
    setCopyHint(null);
    try {
      const r = await postWdInterrogate(fileForCaption, {
        model: wdModel,
        threshold: wdThreshold,
      });
      setWdPrompt(r.prompt);
      setWdWeighted(r.prompt_weighted);
      setWdTags(r.tags);
      setWdMeta(`${r.model} · threshold=${r.threshold.toFixed(2)} · ${Object.keys(r.tags).length} tags`);
      setWdHistory((h) =>
        [
          {
            id: crypto.randomUUID(),
            t: Date.now(),
            prompt: r.prompt,
            weighted: r.prompt_weighted,
            model: r.model,
            th: r.threshold,
          },
          ...h,
        ].slice(0, 8),
      );
    } catch (e) {
      setWdPrompt("");
      setWdWeighted("");
      setWdTags({});
      setWdMeta(null);
      setWdErr(e instanceof Error ? e.message : "WD 反推失败");
    } finally {
      setWdBusy(false);
    }
  }, [fileForCaption, wdModel, wdThreshold]);

  const onCopy = async (label: string, text: string) => {
    if (!text) return;
    const ok = await copyText(text);
    if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
    setCopyHint(ok ? `已复制：${label}` : "复制失败（请检查浏览器剪贴板权限）");
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
    <section
      id="toolbox-ai-tools"
      className="scroll-mt-20 space-y-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-zinc-900"
    >
      {mlApiOk === false ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong className="font-semibold">仅本地工具可用：</strong>
          无法连接推理服务 <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">{apiBase}</code>
          。上方图片压缩/裁剪等仍可用；反推、翻译、WD 需先启动 <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">api</code>{" "}
          服务。
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          反推与翻译（本地模型）
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          需先启动 FastAPI 服务（默认{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">{apiBase}</code>
          ）。可在{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">web/.env.local</code>{" "}
          中设置{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">
            NEXT_PUBLIC_ML_API_URL
          </code>
          。<code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">api/.hf</code>{" "}
          是配置文件；模型文件放在{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">HF_MODELS_ROOT</code>{" "}
          （默认项目根下的{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">.hf</code>{" "}
          文件夹）。模板见{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">api/.hf.example</code>
          ；也可用{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-zinc-800">api/.env</code>{" "}
          覆盖。
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            图片反推（BLIP → 英文描述，可选中译）
          </h3>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
              选择图片
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={!fileForCaption || captionBusy}
              onClick={runCaption}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {captionBusy ? "反推中…" : "开始反推"}
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeZh}
              onChange={(e) => setIncludeZh(e.target.checked)}
              className="rounded border-gray-400 text-green-600 focus:ring-green-500"
            />
            同时翻译成中文（需加载 en→zh 模型）
          </label>
          {localFile ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              已选本地文件：{localFile.name}（优先于工具箱当前图）
            </p>
          ) : imageFile ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              将使用工具箱当前图片：{imageFile.name}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              请选择一张图片，或在上方工具箱先载入图片。
            </p>
          )}
          {captionErr ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {captionErr}
            </p>
          ) : null}
          {captionEn ? (
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-zinc-950/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  English
                </span>
                <button
                  type="button"
                  onClick={() => onCopy("英文", captionEn)}
                  className="text-xs text-green-700 hover:underline dark:text-green-400"
                >
                  复制
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                {captionEn}
              </p>
              {captionZh ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                      中文
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopy("中文", captionZh)}
                      className="text-xs text-green-700 hover:underline dark:text-green-400"
                    >
                      复制
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                    {captionZh}
                  </p>
                </>
              ) : includeZh ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">中文翻译未返回（可检查 en→zh 模型）。</p>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              WD14 标签反推（Danbooru 标签，参考 tagger）
            </h3>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              ONNX 推理，与{" "}
              <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">tagger/backend-fastapi</code>{" "}
              同源；可在 <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">api/.hf</code>{" "}
              配置 <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">WD_*_PATH</code>{" "}
              指向含 model.onnx 的 snapshots 目录。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={wdModel}
                onChange={(e) => setWdModel(e.target.value)}
                className="max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {(wdModels.length ? wdModels : ["wd14-convnextv2-v2", "wd14-swinv2-v2", "wd14-vit-v2"]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ),
                )}
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                阈值 {(wdThreshold * 100).toFixed(0)}%
                <input
                  type="range"
                  min={0.05}
                  max={0.95}
                  step={0.05}
                  value={wdThreshold}
                  onChange={(e) => setWdThreshold(Number(e.target.value))}
                  className="w-28 accent-green-600 sm:w-36"
                />
              </label>
              <button
                type="button"
                disabled={!fileForCaption || wdBusy}
                onClick={runWd}
                className="rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
              >
                {wdBusy ? "WD 反推中…" : "WD 标签反推"}
              </button>
            </div>
            {wdErr ? (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {wdErr}
              </p>
            ) : null}
            {wdPrompt ? (
              <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                {wdMeta ? (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{wdMeta}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onCopy("标签 CSV", wdTagsToCsv(wdTags))}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    复制 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([wdTagsToCsv(wdTags)], {
                        type: "text/csv;charset=utf-8",
                      });
                      downloadBlob(blob, "wd-tags.csv");
                    }}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    下载 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy("权重序标签", wdTagsToCommaLine(wdTags))}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    复制权重序标签串
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">prompt</span>
                  <button
                    type="button"
                    onClick={() => onCopy("WD prompt", wdPrompt)}
                    className="text-xs text-green-700 hover:underline dark:text-green-400"
                  >
                    复制
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">
                  {wdPrompt}
                </p>
                <div className="flex items-center justify-between gap-2 border-t border-emerald-200/80 pt-2 dark:border-emerald-900/40">
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                    weighted
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopy("WD weighted", wdWeighted)}
                    className="text-xs text-green-700 hover:underline dark:text-green-400"
                  >
                    复制
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-gray-800 dark:text-gray-200">
                  {wdWeighted}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            中英文互译（Marian / opus-mt）
          </h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={transDir}
              onChange={(e) => setTransDir(e.target.value as "zh2en" | "en2zh")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="zh2en">中文 → English</option>
              <option value="en2zh">English → 中文</option>
            </select>
            <button
              type="button"
              disabled={!transIn.trim() || transBusy}
              onClick={runTranslate}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {transBusy ? "翻译中…" : "翻译"}
            </button>
          </div>
          <textarea
            value={transIn}
            onChange={(e) => setTransIn(e.target.value)}
            placeholder={transDir === "zh2en" ? "输入中文…" : "Enter English…"}
            rows={5}
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {transErr ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {transErr}
            </p>
          ) : null}
          {transOut ? (
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-zinc-950/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  结果
                </span>
                <button
                  type="button"
                  onClick={() => onCopy("译文", transOut)}
                  className="text-xs text-green-700 hover:underline dark:text-green-400"
                >
                  复制
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{transOut}</p>
            </div>
          ) : null}
        </div>
      </div>

      {(captionHistory.length > 0 || wdHistory.length > 0) && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-zinc-950/60">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            本会话历史（最近几条）
          </h3>
          {captionHistory.length > 0 ? (
            <ul className="mt-2 space-y-2 text-[11px] text-gray-700 dark:text-gray-300">
              {captionHistory.map((row) => (
                <li key={row.id} className="border-b border-gray-200 pb-2 last:border-0 dark:border-gray-700">
                  <span className="text-gray-400">
                    {new Date(row.t).toLocaleTimeString()}
                  </span>{" "}
                  · BLIP ·{" "}
                  <span className="text-gray-900 dark:text-gray-100">{row.en.slice(0, 120)}</span>
                  {row.zh ? (
                    <span className="block text-gray-600 dark:text-gray-400">中：{row.zh.slice(0, 120)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {wdHistory.length > 0 ? (
            <ul className="mt-3 space-y-2 border-t border-gray-200 pt-3 text-[11px] text-gray-700 dark:border-gray-700 dark:text-gray-300">
              {wdHistory.map((row) => (
                <li key={row.id} className="border-b border-gray-200 pb-2 last:border-0 dark:border-gray-700">
                  <span className="text-gray-400">{new Date(row.t).toLocaleTimeString()}</span> ·{" "}
                  {row.model} · th={row.th.toFixed(2)} ·{" "}
                  <span className="font-mono text-gray-800 dark:text-gray-200">{row.prompt.slice(0, 100)}…</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <CopyFeedbackToast message={copyHint} />
    </section>
  );
}
