import { sha256HexFromBlob } from "@/lib/blob-hash";
import { fetchMinioReadUrl, getMlApiBase } from "@/lib/ml-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";

const CHANGED = "myimage-temp-illustration-changed";

type TempIllustrationRow = {
  id: string;
  title: string;
  mime_type: string;
  sd_raw: string | null;
  image_key: string;
  content_sha256: string;
  created_at: number;
};

function dispatchChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGED));
  }
}

export function subscribeTempIllustrationChanged(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

function toEntry(r: TempIllustrationRow): TempIllustrationEntry {
  return {
    id: r.id,
    title: r.title,
    mimeType: r.mime_type,
    sdRaw: r.sd_raw,
    imageKey: r.image_key,
    contentSha256: r.content_sha256,
    createdAt: r.created_at,
  };
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("无效的 JSON 响应");
  }
}

export async function fetchTempIllustrations(): Promise<TempIllustrationEntry[]> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/temp-illustrations`);
  const data = await parseJsonOrThrow(res);
  return (data as TempIllustrationRow[]).map(toEntry);
}

export async function createTempIllustration(input: {
  id?: string;
  title: string;
  mimeType: string;
  sdRaw: string | null;
  imageKey: string;
  contentSha256: string;
}): Promise<TempIllustrationEntry> {
  /** 仅元数据入库；新图请用 `saveTempIllustrationFromBlob`（服务端 /with-image）。 */
  const base = getMlApiBase();
  const body: {
    id?: string;
    title: string;
    mime_type: string;
    sd_raw: string | null;
    image_key: string;
    content_sha256: string;
  } = {
    title: input.title,
    mime_type: input.mimeType,
    sd_raw: input.sdRaw,
    image_key: input.imageKey,
    content_sha256: input.contentSha256,
  };
  if (input.id) body.id = input.id;
  const res = await fetch(`${base}/temp-illustrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJsonOrThrow(res);
  dispatchChanged();
  return toEntry(data as TempIllustrationRow);
}

export async function updateTempIllustration(
  id: string,
  input: { title?: string; sdRaw?: string | null; clearSdRaw?: boolean },
): Promise<TempIllustrationEntry> {
  const base = getMlApiBase();
  const body: { title?: string; sd_raw?: string | null; clear_sd_raw?: boolean } = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.clearSdRaw) body.clear_sd_raw = true;
  else if (input.sdRaw !== undefined) body.sd_raw = input.sdRaw;
  const res = await fetch(`${base}/temp-illustrations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJsonOrThrow(res);
  dispatchChanged();
  return toEntry(data as TempIllustrationRow);
}

export async function deleteTempIllustration(id: string): Promise<void> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/temp-illustrations/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(res);
  dispatchChanged();
}

export async function deleteAllTempIllustrations(): Promise<number> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/temp-illustrations/all`, { method: "DELETE" });
  const data = (await parseJsonOrThrow(res)) as { deleted?: number };
  dispatchChanged();
  return typeof data?.deleted === "number" ? data.deleted : 0;
}

export async function findFullDuplicateTempIllustration(params: {
  mimeType: string;
  sdRaw: string | null;
  imageBlob: Blob;
}): Promise<TempIllustrationEntry | null> {
  const contentSha256 = await sha256HexFromBlob(params.imageBlob);
  const base = getMlApiBase();
  const q = new URLSearchParams({
    content_sha256: contentSha256,
    mime_type: params.mimeType || "application/octet-stream",
  });
  if (params.sdRaw?.trim()) q.set("sd_raw", params.sdRaw.trim());
  const res = await fetch(`${base}/temp-illustrations/check-duplicate?${q}`);
  const data = (await parseJsonOrThrow(res)) as {
    duplicate: boolean;
    existing: TempIllustrationRow | null;
  };
  if (!data.duplicate || !data.existing) return null;
  return toEntry(data.existing);
}

export async function fetchTempIllustrationBlob(entry: TempIllustrationEntry): Promise<Blob> {
  const url = await fetchMinioReadUrl(entry.imageKey);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`图片下载失败（HTTP ${res.status}）`);
  }
  return res.blob();
}

export async function saveTempIllustrationFromBlob(input: {
  title: string;
  mimeType: string;
  sdRaw: string | null;
  imageBlob: Blob;
  filename: string;
}): Promise<TempIllustrationEntry> {
  const base = getMlApiBase();
  const fd = new FormData();
  fd.append("file", input.imageBlob, input.filename);
  fd.append("title", input.title);
  fd.append("mime_type", input.mimeType || "application/octet-stream");
  if (input.sdRaw?.trim()) fd.append("sd_raw", input.sdRaw.trim());
  const res = await fetch(`${base}/temp-illustrations/with-image`, { method: "POST", body: fd });
  const data = await parseJsonOrThrow(res);
  dispatchChanged();
  return toEntry(data as TempIllustrationRow);
}
