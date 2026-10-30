/** WD14 标签反推结果持久化（与当前图片指纹绑定） */

export type WdTaggerPersistedSnapshot = {
  imageFingerprint: string;
  wdModel: string;
  wdThreshold: number;
  wdAppliedThreshold: number | null;
  prompt: string;
  promptWeighted: string;
  promptZh: string;
  tags: Record<string, number>;
  ratings: Record<string, number>;
  meta: string | null;
  hasRun: boolean;
  updatedAt: number;
};

export async function fileFingerprint(file: File): Promise<string> {
  const head = await file.slice(0, 65536).arrayBuffer();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", head);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hex}:${file.size}`;
  }
  return `fallback:${file.size}:${file.name}:${head.byteLength}`;
}

function isTagMap(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v).every((n) => typeof n === "number");
}

export function parseWdTaggerSnapshot(raw: unknown): WdTaggerPersistedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.imageFingerprint !== "string" || typeof o.wdModel !== "string") return null;
  if (typeof o.wdThreshold !== "number" || typeof o.prompt !== "string") return null;
  if (typeof o.promptWeighted !== "string" || typeof o.promptZh !== "string") return null;
  if (!isTagMap(o.tags) || !isTagMap(o.ratings)) return null;
  if (!o.hasRun) return null;
  return {
    imageFingerprint: o.imageFingerprint,
    wdModel: o.wdModel,
    wdThreshold: o.wdThreshold,
    wdAppliedThreshold: typeof o.wdAppliedThreshold === "number" ? o.wdAppliedThreshold : null,
    prompt: o.prompt,
    promptWeighted: o.promptWeighted,
    promptZh: o.promptZh,
    tags: o.tags,
    ratings: o.ratings,
    meta: typeof o.meta === "string" ? o.meta : null,
    hasRun: true,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
  };
}

export function buildWdTaggerSnapshot(input: {
  imageFingerprint: string;
  wdModel: string;
  wdThreshold: number;
  wdAppliedThreshold: number | null;
  prompt: string;
  promptWeighted: string;
  promptZh: string;
  tags: Record<string, number>;
  ratings: Record<string, number>;
  meta: string | null;
}): WdTaggerPersistedSnapshot {
  return {
    ...input,
    hasRun: true,
    updatedAt: Date.now(),
  };
}
