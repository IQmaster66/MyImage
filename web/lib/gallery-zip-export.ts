import JSZip from "jszip";
import type { CharacterEntry } from "@/lib/character-types";
import { fetchMinioReadUrl } from "@/lib/ml-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-db";
import { downloadBlob } from "@/lib/image-toolbox";

/** 用于 ZIP 内路径的片段：去掉非法字符并限制长度 */
export function sanitizeFilenameSegment(s: string, maxLen = 72): string {
  const t = s.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim();
  return (t || "unnamed").slice(0, maxLen);
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  return "bin";
}

function extFromObjectKey(key: string): string | null {
  const m = key.trim().match(/\.([a-z0-9]+)$/i);
  if (!m) return null;
  const e = m[1].toLowerCase();
  if (!/^(jpe?g|png|webp|gif|bmp)$/i.test(e)) return null;
  return e;
}

export function zipFilenameWithDate(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}`;
  return `${prefix}-${stamp}.zip`;
}

export function tempIllustrationZipParts(entries: TempIllustrationEntry[]): { pathInZip: string; data: Blob }[] {
  return entries.map((e, i) => {
    const idx = String(i + 1).padStart(3, "0");
    const base = sanitizeFilenameSegment(e.title || "未命名");
    const ext = extFromMime(e.mimeType);
    return { pathInZip: `${idx}-${base}-${e.id.slice(0, 8)}.${ext}`, data: e.blob };
  });
}

export async function characterImageZipParts(entries: CharacterEntry[]): Promise<{ pathInZip: string; data: Blob }[]> {
  return Promise.all(
    entries.map(async (c, i) => {
      const readUrl = await fetchMinioReadUrl(c.imageKey);
      const res = await fetch(readUrl);
      if (!res.ok) {
        throw new Error(`「${c.name}」图片下载失败（HTTP ${res.status}）`);
      }
      const blob = await res.blob();
      const idx = String(i + 1).padStart(3, "0");
      const base = sanitizeFilenameSegment(c.name || "未命名");
      const fromKey = extFromObjectKey(c.imageKey);
      const fromHdr = res.headers.get("content-type");
      const ext = fromKey ?? extFromMime(fromHdr || "");
      const dotExt = ext === "bin" ? "jpg" : ext;
      return { pathInZip: `${idx}-${base}-${c.id.slice(0, 8)}.${dotExt}`, data: blob };
    }),
  );
}

/** 若 ZIP 内出现重名路径，自动加 _2、_3… 避免覆盖 */
function dedupePaths(parts: { pathInZip: string; data: Blob }[]): { pathInZip: string; data: Blob }[] {
  const used = new Set<string>();
  return parts.map((p) => {
    let path = p.pathInZip;
    if (!used.has(path)) {
      used.add(path);
      return p;
    }
    const dot = path.lastIndexOf(".");
    const base = dot > 0 ? path.slice(0, dot) : path;
    const ext = dot > 0 ? path.slice(dot) : "";
    let n = 2;
    let candidate = `${base}_${n}${ext}`;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${base}_${n}${ext}`;
    }
    used.add(candidate);
    return { ...p, pathInZip: candidate };
  });
}

export async function buildAndDownloadZip(
  parts: { pathInZip: string; data: Blob }[],
  zipDownloadName: string,
): Promise<void> {
  if (parts.length === 0) return;
  const zip = new JSZip();
  for (const p of dedupePaths(parts)) {
    zip.file(p.pathInZip, p.data);
  }
  const zblob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zblob, zipDownloadName);
}
