"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/image-toolbox";
import {
  fetchWdModels,
  getMlApiBase,
  getMlHealth,
  postWdInterrogate,
} from "@/lib/ml-api";
import {
  readWdAutoTranslateZh,
  translateWdPromptEnToZh,
  writeWdAutoTranslateZh,
} from "@/lib/wd-prompt-translate";
import { sortWdTagsByWeight, wdTagsToCsv } from "@/lib/wd-tags-export";
import {
  buildWdTaggerSnapshot,
  fileFingerprint,
  type WdTaggerPersistedSnapshot,
} from "@/lib/wd-tagger-session";

type Props = {
  /** 工具箱当前图片 */
  imageFile: File | null;
  /** 工具箱会话恢复的反推结果 */
  persistedSnapshot?: WdTaggerPersistedSnapshot | null;
  /** 反推/翻译完成后回写，供工具箱会话保存 */
  onPersistedSnapshotChange?: (snapshot: WdTaggerPersistedSnapshot | null) => void;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const FALLBACK_MODELS = [
  "wd-vit-large-v3",
  "wd-swinv2-v3",
  "wd-convnext-v3",
  "camie-tagger-v2",
  "wd14-convnextv2-v2",
  "wd14-swinv2-v2",
  "wd14-vit-v2",
] as const;

export function WdTaggerPanel({
  imageFile,
  persistedSnapshot = null,
  onPersistedSnapshotChange,
}: Props) {
  const apiBase = getMlApiBase();
  const fileForWd = imageFile;

  const [wdModels, setWdModels] = useState<string[]>([]);
  const [wdModel, setWdModel] = useState("wd14-convnextv2-v2");
  const [wdThreshold, setWdThreshold] = useState(0.35);
  const [wdBusy, setWdBusy] = useState(false);
  const [wdErr, setWdErr] = useState<string | null>(null);
  const [wdPrompt, setWdPrompt] = useState("");
  const [wdWeighted, setWdWeighted] = useState("");
  const [wdMeta, setWdMeta] = useState<string | null>(null);
  const [wdTags, setWdTags] = useState<Record<string, number>>({});
  const [wdRatings, setWdRatings] = useState<Record<string, number>>({});
  const [wdAppliedThreshold, setWdAppliedThreshold] = useState<number | null>(null);
  const [wdPromptZh, setWdPromptZh] = useState("");
  const [autoTranslateZh, setAutoTranslateZh] = useState(true);
  const [transBusy, setTransBusy] = useState(false);
  const [transErr, setTransErr] = useState<string | null>(null);

  const [mlApiOk, setMlApiOk] = useState<boolean | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const copyHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWdRunRef = useRef(false);
  const wdReRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wdParamsRef = useRef({ model: wdModel, threshold: wdThreshold });
  const fileFpRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyWdSnapshot = useCallback((snap: WdTaggerPersistedSnapshot) => {
    setWdModel(snap.wdModel);
    setWdThreshold(snap.wdThreshold);
    setWdPrompt(snap.prompt);
    setWdWeighted(snap.promptWeighted);
    setWdPromptZh(snap.promptZh);
    setWdTags(snap.tags);
    setWdRatings(snap.ratings);
    setWdMeta(snap.meta);
    setWdAppliedThreshold(snap.wdAppliedThreshold);
    setWdErr(null);
    setTransErr(null);
    hasWdRunRef.current = true;
    wdParamsRef.current = { model: snap.wdModel, threshold: snap.wdThreshold };
  }, []);

  const resetWdOutput = useCallback(() => {
    hasWdRunRef.current = false;
    setWdPrompt("");
    setWdWeighted("");
    setWdPromptZh("");
    setWdTags({});
    setWdRatings({});
    setWdMeta(null);
    setWdAppliedThreshold(null);
    setWdErr(null);
    setTransErr(null);
    wdParamsRef.current = { model: wdModel, threshold: wdThreshold };
  }, [wdModel, wdThreshold]);

  useEffect(() => {
    setAutoTranslateZh(readWdAutoTranslateZh());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!fileForWd) {
        fileFpRef.current = null;
        resetWdOutput();
        onPersistedSnapshotChange?.(null);
        return;
      }
      const fp = await fileFingerprint(fileForWd);
      if (cancelled) return;

      if (fileFpRef.current === fp && hasWdRunRef.current) return;

      const external = persistedSnapshot;
      if (external?.hasRun && external.imageFingerprint === fp) {
        fileFpRef.current = fp;
        applyWdSnapshot(external);
        return;
      }

      fileFpRef.current = fp;
      resetWdOutput();
      onPersistedSnapshotChange?.(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [fileForWd, persistedSnapshot, applyWdSnapshot, resetWdOutput, onPersistedSnapshotChange]);

  useEffect(() => {
    if (!hasWdRunRef.current || !fileForWd) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void (async () => {
        try {
          const fp = await fileFingerprint(fileForWd);
          const snap = buildWdTaggerSnapshot({
            imageFingerprint: fp,
            wdModel,
            wdThreshold,
            wdAppliedThreshold,
            prompt: wdPrompt,
            promptWeighted: wdWeighted,
            promptZh: wdPromptZh,
            tags: wdTags,
            ratings: wdRatings,
            meta: wdMeta,
          });
          onPersistedSnapshotChange?.(snap);
        } catch {
          /* 静默 */
        }
      })();
    }, 500);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    fileForWd,
    wdModel,
    wdThreshold,
    wdAppliedThreshold,
    wdPrompt,
    wdWeighted,
    wdPromptZh,
    wdTags,
    wdRatings,
    wdMeta,
    onPersistedSnapshotChange,
  ]);

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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const runTranslateZh = useCallback(async (englishPrompt: string) => {
    const trimmed = englishPrompt.trim();
    if (!trimmed) {
      setWdPromptZh("");
      return;
    }
    setTransBusy(true);
    setTransErr(null);
    try {
      setWdPromptZh(await translateWdPromptEnToZh(trimmed));
    } catch (e) {
      setWdPromptZh("");
      setTransErr(e instanceof Error ? e.message : "翻译失败");
    } finally {
      setTransBusy(false);
    }
  }, []);

  const onCopy = useCallback(async (label: string, text: string) => {
    if (!text) return;
    const ok = await copyText(text);
    if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
    setCopyHint(ok ? `已复制：${label}` : "复制失败（请检查浏览器剪贴板权限）");
    copyHintTimerRef.current = setTimeout(() => {
      setCopyHint(null);
      copyHintTimerRef.current = null;
    }, 3200);
  }, []);

  const runWd = useCallback(async () => {
    if (!fileForWd) return;
    setWdBusy(true);
    setWdErr(null);
    setCopyHint(null);
    try {
      const r = await postWdInterrogate(fileForWd, {
        model: wdModel,
        threshold: wdThreshold,
      });
      setWdPrompt(r.prompt);
      setWdWeighted(r.prompt_weighted);
      setWdTags(r.tags);
      setWdRatings(r.ratings ?? {});
      setWdAppliedThreshold(r.threshold);
      hasWdRunRef.current = true;
      wdParamsRef.current = { model: wdModel, threshold: wdThreshold };
      setWdMeta(
        `${r.model} · 阈值 ${(r.threshold * 100).toFixed(0)}% · ${Object.keys(r.tags).length} 个标签`,
      );
      if (autoTranslateZh) {
        void runTranslateZh(r.prompt);
      } else {
        setWdPromptZh("");
        setTransErr(null);
      }
    } catch (e) {
      setWdPrompt("");
      setWdWeighted("");
      setWdPromptZh("");
      setWdTags({});
      setWdRatings({});
      setWdMeta(null);
      setWdErr(e instanceof Error ? e.message : "WD14 反推失败");
    } finally {
      setWdBusy(false);
    }
  }, [fileForWd, wdModel, wdThreshold, autoTranslateZh, runTranslateZh]);

  useEffect(() => {
    if (!fileForWd || !hasWdRunRef.current) return;
    const prev = wdParamsRef.current;
    if (prev.model === wdModel && prev.threshold === wdThreshold) return;
    wdParamsRef.current = { model: wdModel, threshold: wdThreshold };
    if (wdReRunTimerRef.current) clearTimeout(wdReRunTimerRef.current);
    wdReRunTimerRef.current = setTimeout(() => {
      wdReRunTimerRef.current = null;
      void runWd();
    }, 450);
    return () => {
      if (wdReRunTimerRef.current) {
        clearTimeout(wdReRunTimerRef.current);
        wdReRunTimerRef.current = null;
      }
    };
  }, [wdThreshold, wdModel, fileForWd, runWd]);

  useEffect(() => {
    return () => {
      if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
      if (wdReRunTimerRef.current) clearTimeout(wdReRunTimerRef.current);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const wdThresholdPending =
    wdAppliedThreshold !== null && Math.abs(wdThreshold - wdAppliedThreshold) > 0.001;

  const sortedTags = sortWdTagsByWeight(wdTags);
  const modelOptions = wdModels.length ? wdModels : [...FALLBACK_MODELS];

  return (
    <div className="space-y-4">
      {mlApiOk === false ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong className="font-semibold">推理服务未连接：</strong>
          请先启动 <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">api</code>（默认{" "}
          <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">{apiBase}</code>
          ）。WD14 模型首次使用会从 Hugging Face 下载到{" "}
          <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">.hf</code>，或在{" "}
          <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">api/.hf</code> 配置{" "}
          <code className="rounded bg-white/80 px-1 dark:bg-zinc-900">WD_*_PATH</code>。
        </div>
      ) : null}

      {imageFile ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">使用工具箱当前图片：{imageFile.name}</p>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">请先在左侧载入图片，再使用标签反推。</p>
      )}

      <WdControlsColumn
        fileLabel={fileForWd?.name}
        wdModel={wdModel}
        setWdModel={setWdModel}
        modelOptions={modelOptions}
        wdThreshold={wdThreshold}
        setWdThreshold={setWdThreshold}
        wdThresholdPending={wdThresholdPending}
        wdBusy={wdBusy}
        fileForWd={fileForWd}
        runWd={runWd}
        wdErr={wdErr}
        autoTranslateZh={autoTranslateZh}
        onAutoTranslateZhChange={(v) => {
          setAutoTranslateZh(v);
          writeWdAutoTranslateZh(v);
        }}
      />

      {wdPrompt ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/25 sm:p-5">
          {wdMeta ? <p className="text-[11px] text-gray-500 dark:text-gray-400">{wdMeta}</p> : null}

          {Object.keys(wdRatings).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(wdRatings).map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-700 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200"
                >
                  {k.replace(/_/g, " ")} {(v * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopy("Danbooru 标签", wdPrompt)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              复制标签（prompt）
            </button>
            <button
              type="button"
              onClick={() => void onCopy("加权标签", wdWeighted)}
              className="rounded border border-emerald-400 bg-white px-2.5 py-1.5 text-xs text-emerald-900 dark:border-emerald-600 dark:bg-zinc-900 dark:text-emerald-200"
            >
              复制加权串
            </button>
            <button
              type="button"
              onClick={() => void onCopy("CSV", wdTagsToCsv(wdTags))}
              className="rounded border border-emerald-300 bg-white px-2.5 py-1.5 text-xs dark:border-emerald-700 dark:bg-zinc-900"
            >
              复制 CSV
            </button>
            {wdPromptZh ? (
              <button
                type="button"
                onClick={() => void onCopy("中文标签", wdPromptZh)}
                className="rounded border border-sky-400 bg-white px-2.5 py-1.5 text-xs text-sky-900 dark:border-sky-600 dark:bg-zinc-900 dark:text-sky-200"
              >
                复制中文
              </button>
            ) : null}
            <button
              type="button"
              disabled={transBusy || !wdPrompt}
              onClick={() => void runTranslateZh(wdPrompt)}
              className="rounded border border-sky-300 bg-white px-2.5 py-1.5 text-xs text-sky-800 disabled:opacity-50 dark:border-sky-700 dark:bg-zinc-900 dark:text-sky-200"
            >
              {transBusy ? "翻译中…" : wdPromptZh ? "重新翻译" : "译为中文"}
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([wdTagsToCsv(wdTags)], { type: "text/csv;charset=utf-8" });
                downloadBlob(blob, "wd-tags.csv");
              }}
              className="rounded border border-emerald-300 bg-white px-2.5 py-1.5 text-xs dark:border-emerald-700 dark:bg-zinc-900"
            >
              下载 CSV
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Danbooru 标签（英文，可直接用于 SD / ComfyUI）
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/80 p-3 text-sm leading-relaxed text-gray-900 dark:bg-zinc-900/80 dark:text-gray-100">
              {wdPrompt}
            </p>
          </div>

          {(wdPromptZh || transBusy || transErr) && (
            <div>
              <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">
                中文释义
                {transBusy ? <span className="ml-2 font-normal text-gray-500">翻译中…</span> : null}
              </p>
              {transErr ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  {transErr}
                  <span className="mt-1 block text-[10px] text-amber-800/80 dark:text-amber-200/80">
                    需 api 已启动；en→zh 模型应位于项目 <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-900/50">.hf/models--Helsinki-NLP--opus-mt-en-zh</code>
                    。若仍超时，在 <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-900/50">api/.hf</code> 填写 EN_ZH_MODEL_DIR 为 snapshots 路径后重启 api。
                  </span>
                </p>
              ) : wdPromptZh ? (
                <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-sky-200/80 bg-sky-50/60 p-3 text-sm leading-relaxed text-gray-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-gray-100">
                  {wdPromptZh}
                </p>
              ) : transBusy ? (
                <p className="mt-2 text-xs text-gray-500">正在调用 Marian 模型翻译标签…</p>
              ) : null}
            </div>
          )}

          {sortedTags.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">标签云（按置信度）</p>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {sortedTags.map(([tag, w]) => (
                  <span
                    key={tag}
                    title={`${(w * 100).toFixed(1)}%`}
                    className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-gray-800 ring-1 ring-emerald-200/80 dark:bg-zinc-800 dark:text-gray-100 dark:ring-emerald-900/60"
                  >
                    {tag}
                    <span className="ml-1 tabular-nums text-emerald-700 dark:text-emerald-400">
                      {(w * 100).toFixed(0)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">加权 prompt 串</summary>
            <p className="mt-2 break-words font-mono text-[11px] text-gray-800 dark:text-gray-200">{wdWeighted}</p>
          </details>
        </div>
      ) : null}

      <CopyFeedbackToast message={copyHint} />
    </div>
  );
}

type ControlsProps = {
  fileLabel?: string;
  wdModel: string;
  setWdModel: (v: string) => void;
  modelOptions: string[];
  wdThreshold: number;
  setWdThreshold: (v: number) => void;
  wdThresholdPending: boolean;
  wdBusy: boolean;
  fileForWd: File | null;
  runWd: () => void;
  wdErr: string | null;
  autoTranslateZh: boolean;
  onAutoTranslateZhChange: (v: boolean) => void;
};

function WdControlsColumn({
  fileLabel,
  wdModel,
  setWdModel,
  modelOptions,
  wdThreshold,
  setWdThreshold,
  wdThresholdPending,
  wdBusy,
  fileForWd,
  runWd,
  wdErr,
  autoTranslateZh,
  onAutoTranslateZhChange,
}: ControlsProps) {
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-zinc-900">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">WD14 标签反推</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          针对<strong className="font-medium text-gray-700 dark:text-gray-300">动漫 / 二次元</strong>
          插画，输出 Danbooru 风格标签，适合 Stable Diffusion、NovelAI 等。
        </p>
      </div>

      <div>
        <label htmlFor="wd-model" className="text-xs font-medium text-gray-700 dark:text-gray-300">
          模型
        </label>
        <select
          id="wd-model"
          value={wdModel}
          onChange={(e) => setWdModel(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-gray-500">推荐 wd14-convnextv2-v2（动漫标签较全）</p>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          置信度阈值 {(wdThreshold * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.05}
          value={wdThreshold}
          onChange={(e) => setWdThreshold(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-600"
          aria-label="标签置信度阈值"
        />
        <p className="mt-1 text-[10px] text-gray-500">
          越高标签越少、越准；动漫图常用 30%–45%。调整后自动重新反推。
          {wdThresholdPending && !wdBusy ? " · 应用中…" : null}
          {wdBusy ? " · 反推中…" : null}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
        <input
          type="checkbox"
          checked={autoTranslateZh}
          onChange={(e) => onAutoTranslateZhChange(e.target.checked)}
          className="mt-0.5 accent-sky-600"
        />
        <span className="text-[11px] leading-snug text-gray-700 dark:text-gray-300">
          反推后自动将英文标签译为中文（Marian en→zh，便于阅读；生图仍用上方英文串）
        </span>
      </label>

      <button
        type="button"
        disabled={!fileForWd || wdBusy}
        onClick={() => void runWd()}
        className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {wdBusy ? "反推中…" : "WD 标签反推"}
      </button>

      {fileLabel ? (
        <p className="truncate text-[10px] text-gray-500" title={fileLabel}>
          当前：{fileLabel}
        </p>
      ) : null}

      {wdErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {wdErr}
        </p>
      ) : null}
    </div>
  );
}
