import { extractComfyUiParameters } from "@/lib/comfyui-parameters";
import type { PngTextChunkEntry } from "@/lib/png-text-chunks";

/** A1111 / ComfyUI 导出参数解析结果（ComfyUI 会先规范成 A1111 风格文本） */
export type SdParsedParameters = {
  positive: string;
  negative: string;
  fields: Record<string, string>;
  /** 未放入 fields 的尾部原文（解析失败时的兜底） */
  rawParamsTail: string;
  /** 从正/负向提示词里解析的 `<lora:...>` */
  loraTags: string[];
};

const STEPS_LINE = /(?:^|[\r\n])Steps:\s*/i;
const NEGATIVE_PROMPT = /\bNegative prompt:\s*/i;

/**
 * 从 PNG 文本块与 EXIF 中取出生成参数长文本。
 * 优先 A1111 `parameters`；若无则解析 ComfyUI 的 `prompt` / `workflow` JSON。
 */
export function extractStableDiffusionParameters(
  pngChunks: PngTextChunkEntry[],
  exif: Record<string, unknown> | null,
): string | null {
  for (const c of pngChunks) {
    if (c.keyword.toLowerCase() === "parameters" && c.text?.trim()) {
      return c.text.trim();
    }
  }

  if (exif) {
    const preferKeys = ["parameters", "Parameters", "UserComment", "ImageDescription"] as const;
    for (const key of preferKeys) {
      const v = exif[key];
      if (typeof v === "string" && v.trim().length > 8) {
        const t = v.trim();
        if (/\bSteps:\s*\d+/i.test(t) || /\bNegative prompt:/i.test(t)) return t;
      }
    }

    let best: string | null = null;
    for (const v of Object.values(exif)) {
      if (typeof v !== "string" || v.length < 20) continue;
      if (/\bSteps:\s*\d+/.test(v) && /\bSampler:/i.test(v)) {
        if (!best || v.length > best.length) best = v;
      }
    }
    if (best) return best;
  }

  return extractComfyUiParameters(pngChunks, exif);
}

function splitAtSteps(s: string): { before: string; fromSteps: string } {
  const m = s.match(STEPS_LINE);
  if (!m || m.index === undefined) {
    return { before: s.trim(), fromSteps: "" };
  }
  return {
    before: s.slice(0, m.index).trim(),
    fromSteps: s.slice(m.index).trim(),
  };
}

/** 逗号分隔的 `Key: value`，value 内可能含逗号（合并到上一段） */
function splitKeyValueSegments(line: string): string[] {
  const chunks = line.split(", ");
  const merged: string[] = [];
  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!merged.length) {
      merged.push(c);
      continue;
    }
    if (/^[\w\s]+\s*:\s*/.test(c)) {
      merged.push(c);
    } else {
      merged[merged.length - 1] += ", " + c;
    }
  }
  return merged.map((s) => s.trim()).filter(Boolean);
}

function parseFieldsLine(paramsLine: string): Record<string, string> {
  const oneLine = paramsLine.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
  if (!oneLine) return {};
  const out: Record<string, string> = {};
  for (const seg of splitKeyValueSegments(oneLine)) {
    const idx = seg.indexOf(":");
    if (idx <= 0) continue;
    const key = seg.slice(0, idx).trim();
    const val = seg.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function extractLoraNames(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/<lora:([^:>]+)\s*:\s*[\d.]+\s*>/gi)) {
    const n = m[1]?.trim();
    if (n) names.add(n);
  }
  return [...names];
}

const FIELD_ORDER = [
  "Steps",
  "Sampler",
  "Schedule type",
  "CFG scale",
  "Seed",
  "Variation seed",
  "Variation strength",
  "Size",
  "Model hash",
  "Model",
  "Denoising strength",
  "Hires upscale",
  "Hires steps",
  "Hires upscaler",
  "Clip skip",
  "ENSD",
  "Version",
  "VAE",
] as const;

/**
 * 解析 Automatic1111 风格 `parameters` 文本（含 Negative prompt 与 Steps: 起手的参数行）。
 * 无法识别结构时仍返回 positive=全文、fields 尽量从 tail 解析。
 */
export function parseA1111Parameters(raw: string): SdParsedParameters {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return {
      positive: "",
      negative: "",
      fields: {},
      rawParamsTail: "",
      loraTags: [],
    };
  }

  const negIdx = trimmed.search(NEGATIVE_PROMPT);
  let positive: string;
  let middle: string;

  if (negIdx >= 0) {
    positive = trimmed.slice(0, negIdx).trimEnd();
    middle = trimmed.slice(negIdx).replace(NEGATIVE_PROMPT, "");
  } else {
    positive = "";
    middle = trimmed;
  }

  const { before, fromSteps } = splitAtSteps(middle);

  let negative: string;
  let paramsLine: string;

  if (negIdx >= 0) {
    negative = before;
    paramsLine = fromSteps;
  } else {
    positive = before;
    negative = "";
    paramsLine = fromSteps;
  }

  const fields = parseFieldsLine(paramsLine);
  const loraTags = [
    ...extractLoraNames(positive),
    ...extractLoraNames(negative),
    ...extractLoraFromField(fields["Lora hashes"]),
    ...extractLoraFromField(fields["Hashes"]),
  ];
  const uniqueLoras = [...new Set(loraTags)];

  return {
    positive: positive.trim(),
    negative: negative.trim(),
    fields,
    rawParamsTail: paramsLine,
    loraTags: uniqueLoras,
  };
}

function extractLoraFromField(s: string | undefined): string[] {
  if (!s?.trim()) return [];
  const parts = s.split(",").map((x) => x.trim());
  const names: string[] = [];
  for (const p of parts) {
    const m = p.match(/^([^:]+):/);
    if (m?.[1]) names.push(m[1].trim());
  }
  return names;
}

/** 展示顺序：常用字段优先，其余按字母序 */
export function orderedSdFields(fields: Record<string, string>): { key: string; value: string }[] {
  const used = new Set<string>();
  const rows: { key: string; value: string }[] = [];
  for (const k of FIELD_ORDER) {
    if (fields[k] !== undefined) {
      rows.push({ key: k, value: fields[k] });
      used.add(k);
    }
  }
  const rest = Object.keys(fields)
    .filter((k) => !used.has(k))
    .sort((a, b) => a.localeCompare(b));
  for (const k of rest) {
    rows.push({ key: k, value: fields[k] });
  }
  return rows;
}
