import type { PngTextChunkEntry } from "@/lib/png-text-chunks";

type ComfyNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

/** ComfyUI API 格式：`prompt` 文本块里的节点图 */
type ComfyPromptGraph = Record<string, ComfyNode>;

type ComfyWorkflowNode = {
  id?: number | string;
  type?: string;
  title?: string;
  widgets_values?: unknown[];
};

type ExtractedComfy = {
  positive: string;
  negative: string;
  steps?: string;
  sampler?: string;
  scheduler?: string;
  cfg?: string;
  seed?: string;
  width?: string;
  height?: string;
  model?: string;
  denoise?: string;
  vae?: string;
  loras: string[];
};

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function linkId(v: unknown): string | null {
  if (Array.isArray(v) && v.length >= 1) {
    const id = v[0];
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return null;
}

function isPromptGraph(obj: unknown): obj is ComfyPromptGraph {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const values = Object.values(obj as Record<string, unknown>);
  if (!values.length) return false;
  let hits = 0;
  for (const v of values) {
    if (!v || typeof v !== "object") continue;
    const n = v as ComfyNode;
    if (typeof n.class_type === "string") hits += 1;
  }
  return hits >= 1;
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function resolveTextFromNode(
  graph: ComfyPromptGraph,
  nodeId: string | null,
  depth = 0,
  seen = new Set<string>(),
): string {
  if (!nodeId || depth > 8 || seen.has(nodeId)) return "";
  seen.add(nodeId);
  const node = graph[nodeId];
  if (!node?.inputs) return "";

  const classType = (node.class_type || "").toLowerCase();
  const direct =
    asString(node.inputs.text) ??
    asString(node.inputs.prompt) ??
    asString(node.inputs.string) ??
    asString(node.inputs.value);
  if (direct && (classType.includes("cliptext") || classType.includes("textencode") || classType.includes("prompt"))) {
    return direct;
  }
  if (direct && !classType.includes("loader") && depth === 0) return direct;

  // 常见条件组合 / 转发
  for (const key of [
    "conditioning",
    "positive",
    "negative",
    "from",
    "samples",
    "text",
    "conditioning_1",
    "conditioning_2",
  ]) {
    const next = linkId(node.inputs[key]);
    if (next) {
      const t = resolveTextFromNode(graph, next, depth + 1, seen);
      if (t) return t;
    }
  }

  if (direct) return direct;
  return "";
}

function collectLoras(graph: ComfyPromptGraph): string[] {
  const names: string[] = [];
  for (const node of Object.values(graph)) {
    const ct = (node.class_type || "").toLowerCase();
    if (!ct.includes("lora")) continue;
    const n =
      asString(node.inputs?.lora_name) ??
      asString(node.inputs?.lora) ??
      asString(node.inputs?.name);
    if (n) names.push(n);
  }
  return [...new Set(names)];
}

function findSamplerNode(graph: ComfyPromptGraph): { id: string; node: ComfyNode } | null {
  const preferred = ["ksampler", "ksampleradvanced", "samplercustom", "samplercustomadvanced"];
  for (const want of preferred) {
    for (const [id, node] of Object.entries(graph)) {
      const ct = (node.class_type || "").toLowerCase();
      if (ct === want || ct.includes(want)) return { id, node };
    }
  }
  for (const [id, node] of Object.entries(graph)) {
    const ct = (node.class_type || "").toLowerCase();
    if (ct.includes("sampler") && node.inputs) return { id, node };
  }
  return null;
}

function extractFromPromptGraph(graph: ComfyPromptGraph): ExtractedComfy | null {
  const sampler = findSamplerNode(graph);
  const inputs = sampler?.node.inputs ?? {};

  let positive = "";
  let negative = "";

  if (sampler) {
    positive = resolveTextFromNode(graph, linkId(inputs.positive));
    negative = resolveTextFromNode(graph, linkId(inputs.negative));
  }

  // 无 sampler 链接时：按 CLIPTextEncode 标题 / 出现顺序兜底
  if (!positive || !negative) {
    const encodes: { id: string; text: string; title: string }[] = [];
    for (const [id, node] of Object.entries(graph)) {
      const ct = (node.class_type || "").toLowerCase();
      if (!ct.includes("cliptext") && !ct.includes("textencode")) continue;
      const text = asString(node.inputs?.text) ?? asString(node.inputs?.prompt) ?? "";
      if (!text) continue;
      const title = (node._meta?.title || "").toLowerCase();
      encodes.push({ id, text, title });
    }
    const negNode = encodes.find((e) => e.title.includes("negative") || e.title.includes("负"));
    const posNode = encodes.find((e) => e.title.includes("positive") || e.title.includes("prompt") || e.title.includes("正"));
    if (!positive) {
      positive = posNode?.text ?? encodes.find((e) => e !== negNode)?.text ?? encodes[0]?.text ?? "";
    }
    if (!negative) {
      negative = negNode?.text ?? (encodes.length > 1 ? encodes[1].text : "");
    }
  }

  let model: string | undefined;
  let vae: string | undefined;
  let width: string | undefined;
  let height: string | undefined;

  for (const node of Object.values(graph)) {
    const ct = (node.class_type || "").toLowerCase();
    if (!model && (ct.includes("checkpointloader") || ct.includes("unetccheckpoint"))) {
      model = asString(node.inputs?.ckpt_name) ?? asString(node.inputs?.model_name) ?? undefined;
    }
    if (!vae && ct.includes("vaeloader")) {
      vae = asString(node.inputs?.vae_name) ?? undefined;
    }
    if ((!width || !height) && (ct.includes("emptylatent") || ct.includes("emptysd3latent") || ct.includes("latentimage"))) {
      width = asString(node.inputs?.width) ?? width;
      height = asString(node.inputs?.height) ?? height;
    }
  }

  const steps = asString(inputs.steps) ?? undefined;
  const cfg = asString(inputs.cfg) ?? asString(inputs.cfg_scale) ?? undefined;
  const seed =
    asString(inputs.seed) ??
    asString(inputs.noise_seed) ??
    asString(inputs.seed_number) ??
    undefined;
  const samplerName = asString(inputs.sampler_name) ?? asString(inputs.sampler) ?? undefined;
  const scheduler = asString(inputs.scheduler) ?? undefined;
  const denoise = asString(inputs.denoise) ?? undefined;

  if (!positive && !negative && !steps && !seed && !model) return null;

  return {
    positive,
    negative,
    steps,
    sampler: samplerName,
    scheduler,
    cfg,
    seed,
    width,
    height,
    model,
    denoise,
    vae,
    loras: collectLoras(graph),
  };
}

/** workflow UI 格式兜底（部分导出只写 workflow） */
function extractFromWorkflow(obj: unknown): ExtractedComfy | null {
  if (!obj || typeof obj !== "object") return null;
  const nodes = (obj as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes) || !nodes.length) return null;

  const encodes: { text: string; title: string; type: string }[] = [];
  let steps: string | undefined;
  let cfg: string | undefined;
  let seed: string | undefined;
  let sampler: string | undefined;
  let scheduler: string | undefined;
  let denoise: string | undefined;
  let model: string | undefined;
  let width: string | undefined;
  let height: string | undefined;
  const loras: string[] = [];

  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as ComfyWorkflowNode;
    const type = (n.type || "").toLowerCase();
    const title = (n.title || "").toLowerCase();
    const widgets = Array.isArray(n.widgets_values) ? n.widgets_values : [];

    if (type.includes("cliptext") || type.includes("textencode")) {
      const text = asString(widgets[0]);
      if (text) encodes.push({ text, title, type });
    }
    if (type.includes("ksampler")) {
      // 常见：seed, seed_mode?, steps, cfg, sampler_name, scheduler, denoise
      // 不同版本 widgets 顺序略有差异，尽量按类型猜测
      const nums = widgets.filter((w) => typeof w === "number" || (typeof w === "string" && /^\d+(\.\d+)?$/.test(w)));
      const strs = widgets.filter((w) => typeof w === "string") as string[];
      seed = asString(widgets[0]) ?? seed;
      if (typeof widgets[2] === "number" || typeof widgets[2] === "string") steps = asString(widgets[2]) ?? steps;
      if (typeof widgets[3] === "number" || typeof widgets[3] === "string") cfg = asString(widgets[3]) ?? cfg;
      sampler = strs.find((s) => !/^(fixed|randomize|increment|decrement)$/i.test(s)) ?? sampler;
      if (strs.length >= 2) scheduler = strs[1] ?? scheduler;
      const lastNum = nums.length ? asString(nums[nums.length - 1]) : null;
      if (lastNum && Number(lastNum) <= 1.0001) denoise = lastNum;
    }
    if (type.includes("checkpointloader")) {
      model = asString(widgets[0]) ?? model;
    }
    if (type.includes("emptylatent") || type.includes("latentimage")) {
      width = asString(widgets[0]) ?? width;
      height = asString(widgets[1]) ?? height;
    }
    if (type.includes("lora") && widgets[0]) {
      const ln = asString(widgets[0]);
      if (ln) loras.push(ln);
    }
  }

  const neg = encodes.find((e) => e.title.includes("negative") || e.title.includes("负"));
  const pos =
    encodes.find((e) => e.title.includes("positive") || e.title.includes("prompt") || e.title.includes("正")) ??
    encodes.find((e) => e !== neg);

  const positive = pos?.text ?? encodes[0]?.text ?? "";
  const negative = neg?.text ?? (encodes.length > 1 ? encodes[1].text : "");

  if (!positive && !negative && !steps && !seed && !model) return null;

  return {
    positive,
    negative,
    steps,
    sampler,
    scheduler,
    cfg,
    seed,
    width,
    height,
    model,
    denoise,
    loras: [...new Set(loras)],
  };
}

/** 转成 A1111 风格 parameters 文本，复用现有 parseA1111Parameters / SdParametersCard */
export function formatComfyAsA1111Parameters(data: ExtractedComfy): string {
  const lines: string[] = [];
  if (data.positive.trim()) lines.push(data.positive.trim());
  lines.push(`Negative prompt: ${data.negative.trim()}`);

  const parts: string[] = [];
  if (data.steps) parts.push(`Steps: ${data.steps}`);
  if (data.sampler) parts.push(`Sampler: ${data.sampler}`);
  if (data.scheduler) parts.push(`Schedule type: ${data.scheduler}`);
  if (data.cfg) parts.push(`CFG scale: ${data.cfg}`);
  if (data.seed) parts.push(`Seed: ${data.seed}`);
  if (data.width && data.height) parts.push(`Size: ${data.width}x${data.height}`);
  if (data.model) parts.push(`Model: ${data.model}`);
  if (data.vae) parts.push(`VAE: ${data.vae}`);
  if (data.denoise) parts.push(`Denoising strength: ${data.denoise}`);
  if (data.loras.length) parts.push(`Lora hashes: ${data.loras.map((n) => `${n}:comfy`).join(", ")}`);
  parts.push("Version: ComfyUI");

  lines.push(parts.join(", "));
  return lines.join("\n");
}

function extractFromTextBlob(text: string): string | null {
  const parsed = tryParseJson(text);
  if (!parsed) return null;

  if (isPromptGraph(parsed)) {
    const data = extractFromPromptGraph(parsed);
    if (data) return formatComfyAsA1111Parameters(data);
  }

  // 有时整包是 { prompt: {...}, workflow: {...} }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const bag = parsed as Record<string, unknown>;
    if (isPromptGraph(bag.prompt)) {
      const data = extractFromPromptGraph(bag.prompt);
      if (data) return formatComfyAsA1111Parameters(data);
    }
    if (bag.workflow) {
      const data = extractFromWorkflow(bag.workflow);
      if (data) return formatComfyAsA1111Parameters(data);
    }
    const asWorkflow = extractFromWorkflow(parsed);
    if (asWorkflow) return formatComfyAsA1111Parameters(asWorkflow);
  }

  return null;
}

/**
 * 从 PNG 文本块 / EXIF 提取 ComfyUI 元数据，并规范为 A1111 风格 parameters 文本。
 * 优先 `prompt`（API 图），其次 `workflow`，再扫 EXIF 长字符串。
 */
export function extractComfyUiParameters(
  pngChunks: PngTextChunkEntry[],
  exif: Record<string, unknown> | null,
): string | null {
  const byKeyword = new Map<string, string>();
  for (const c of pngChunks) {
    const k = c.keyword.toLowerCase();
    if (c.text?.trim()) byKeyword.set(k, c.text.trim());
  }

  for (const key of ["prompt", "workflow", "comfy", "comfyui"]) {
    const text = byKeyword.get(key);
    if (!text) continue;
    const got = extractFromTextBlob(text);
    if (got) return got;
  }

  // 某些构建把 prompt+workflow 分块；上面已分别试过。若 prompt 是纯图但 workflow 可解析，已覆盖。

  if (exif) {
    const preferKeys = ["prompt", "workflow", "UserComment", "ImageDescription", "parameters"] as const;
    for (const key of preferKeys) {
      const v = exif[key];
      if (typeof v !== "string" || v.length < 20) continue;
      // 已是 A1111 的交给上层；这里只吃 JSON
      if (!v.trim().startsWith("{")) continue;
      const got = extractFromTextBlob(v);
      if (got) return got;
    }
    for (const v of Object.values(exif)) {
      if (typeof v !== "string" || v.length < 40) continue;
      if (!v.includes("class_type") && !v.includes('"nodes"')) continue;
      const got = extractFromTextBlob(v);
      if (got) return got;
    }
  }

  return null;
}

export function isComfyUiFormattedParameters(raw: string): boolean {
  return /\bVersion:\s*ComfyUI\b/i.test(raw);
}
