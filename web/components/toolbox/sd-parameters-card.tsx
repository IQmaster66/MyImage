"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isComfyUiFormattedParameters } from "@/lib/comfyui-parameters";
import {
  orderedSdFields,
  parseA1111Parameters,
  type SdParsedParameters,
} from "@/lib/sd-parameters";

type Props = {
  /** 原始 `parameters` 长文本；无则本卡不展示 */
  raw: string | null;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CardBlock({
  label,
  text,
  onCopy,
  copyLabel,
}: {
  label: string;
  text: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  const empty = !text.trim();
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-zinc-900/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <button
          type="button"
          disabled={empty}
          onClick={onCopy}
          className="rounded-md bg-emerald-600/90 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copyLabel}
        </button>
      </div>
      <pre className="max-h-40 min-h-[2.5rem] overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">
        {empty ? <span className="text-gray-400 dark:text-gray-500">（无）</span> : text}
      </pre>
    </div>
  );
}

export function SdParametersCard({ raw }: Props) {
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const parsed: SdParsedParameters = useMemo(
    () => parseA1111Parameters(raw ?? ""),
    [raw],
  );

  const fieldRows = useMemo(() => orderedSdFields(parsed.fields), [parsed]);

  const onCopyPos = useCallback(async () => {
    setCopyHint(null);
    const ok = await copyText(parsed.positive);
    setCopyHint(ok ? "已复制正向提示词" : "复制失败（权限或浏览器限制）");
  }, [parsed]);

  const onCopyNeg = useCallback(async () => {
    setCopyHint(null);
    const ok = await copyText(parsed.negative);
    setCopyHint(ok ? "已复制负向提示词" : "复制失败（权限或浏览器限制）");
  }, [parsed]);

  useEffect(() => {
    if (!copyHint) return;
    const t = window.setTimeout(() => setCopyHint(null), 2800);
    return () => window.clearTimeout(t);
  }, [copyHint]);

  if (!raw?.trim()) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {isComfyUiFormattedParameters(raw) ? "ComfyUI 参数解析" : "SD 参数解析"}
        </h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-500">
          {isComfyUiFormattedParameters(raw) ? (
            <>
              自 PNG <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">prompt</code> /{" "}
              <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">workflow</code> 解析
            </>
          ) : (
            <>
              自 PNG <code className="rounded bg-gray-100 px-0.5 dark:bg-zinc-800">parameters</code> 或
              EXIF 中解析（A1111 等）
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CardBlock
          label="正向提示词"
          text={parsed.positive}
          onCopy={onCopyPos}
          copyLabel="只复制正向"
        />
        <CardBlock
          label="负向提示词"
          text={parsed.negative}
          onCopy={onCopyNeg}
          copyLabel="只复制负向"
        />
      </div>

      {parsed.loraTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">LoRA / 提及：</span>
          {parsed.loraTags.map((name) => (
            <span
              key={name}
              className="rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[10px] text-violet-900 dark:bg-violet-950/80 dark:text-violet-200"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {fieldRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[min(100%,480px)] text-left text-xs">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {fieldRows.map((row) => (
                <tr key={row.key} className="bg-gray-50/50 dark:bg-zinc-950/50">
                  <th className="w-[min(32%,8rem)] align-top whitespace-nowrap px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                    {row.key}
                  </th>
                  <td className="px-3 py-2 font-mono text-[11px] break-words text-gray-900 dark:text-gray-100">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : parsed.rawParamsTail ? (
        <pre className="max-h-32 overflow-auto rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 font-mono text-[11px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          {parsed.rawParamsTail}
        </pre>
      ) : null}

      <CopyFeedbackToast message={copyHint} />
    </div>
  );
}
