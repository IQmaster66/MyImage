const DEFAULT_ML_BASE = "http://127.0.0.1:8787";

export function getMlApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_ML_API_URL?.trim();
  if (!raw) return DEFAULT_ML_BASE;
  return raw.replace(/\/$/, "");
}

export type CaptionResult = {
  caption_en: string;
  caption_zh: string | null;
};

export async function postCaption(
  file: File,
  options?: { includeZh?: boolean },
): Promise<CaptionResult> {
  const base = getMlApiBase();
  const fd = new FormData();
  fd.append("file", file);
  const q = new URLSearchParams();
  if (options?.includeZh === false) q.set("include_zh", "false");
  const url = `${base}/caption${q.size ? `?${q}` : ""}`;
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<CaptionResult>;
}

function parseMlApiErrorBody(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return `HTTP ${status}`;
  try {
    const o = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof o.detail === "string") return o.detail;
  } catch {
    /* 非 JSON */
  }
  return trimmed;
}

export async function postTranslate(
  text: string,
  direction: "zh2en" | "en2zh",
): Promise<string> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(parseMlApiErrorBody(errText, res.status));
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function getMlHealth(): Promise<unknown> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export type WdModelsResult = { models: string[]; default?: string };

export async function fetchWdModels(): Promise<WdModelsResult> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/wd/models`);
  if (!res.ok) throw new Error(`wd/models ${res.status}`);
  return res.json() as Promise<WdModelsResult>;
}

export type WdInterrogateResult = {
  ratings: Record<string, number>;
  tags: Record<string, number>;
  prompt: string;
  prompt_weighted: string;
  threshold: number;
  model: string;
};

export async function postWdInterrogate(
  file: File,
  options?: { model?: string; threshold?: number; replaceUnderscore?: boolean },
): Promise<WdInterrogateResult> {
  const base = getMlApiBase();
  const fd = new FormData();
  fd.append("file", file);
  const q = new URLSearchParams();
  if (options?.model) q.set("model", options.model);
  if (options?.threshold !== undefined) q.set("threshold", String(options.threshold));
  if (options?.replaceUnderscore === false) q.set("replace_underscore", "false");
  const url = `${base}/wd/interrogate${q.size ? `?${q}` : ""}`;
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<WdInterrogateResult>;
}

export type MinioUploadCharacterImageResult = { object_key: string };

export async function postUploadCharacterImage(
  blob: Blob,
  filename: string,
): Promise<MinioUploadCharacterImageResult> {
  const base = getMlApiBase();
  const fd = new FormData();
  fd.append("file", blob, filename);
  const res = await fetch(`${base}/minio/upload-character-image`, { method: "POST", body: fd });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<MinioUploadCharacterImageResult>;
}

export async function postUploadPromptPreviewImage(
  blob: Blob,
  filename: string,
): Promise<MinioUploadCharacterImageResult> {
  const base = getMlApiBase();
  const fd = new FormData();
  fd.append("file", blob, filename);
  const res = await fetch(`${base}/minio/upload-prompt-preview-image`, { method: "POST", body: fd });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<MinioUploadCharacterImageResult>;
}

export async function fetchMinioReadUrl(objectKey: string): Promise<string> {
  const base = getMlApiBase();
  const q = new URLSearchParams({ object_key: objectKey });
  const res = await fetch(`${base}/minio/presign-get?${q}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function deleteMinioObject(objectKey: string): Promise<void> {
  const base = getMlApiBase();
  const q = new URLSearchParams({ object_key: objectKey });
  const res = await fetch(`${base}/minio/object?${q}`, { method: "DELETE" });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }
}
