import exifr from "exifr";
import {
  extractPngTextChunks,
  isPngBuffer,
  type PngTextChunkEntry,
} from "@/lib/png-text-chunks";

export type ImageMetadataResult = {
  pngChunks: PngTextChunkEntry[];
  exif: Record<string, unknown> | null;
};

const HIGHLIGHT_EXIF_KEY =
  /^(parameters|prompt|negativeprompt|usercomment|imagedescription|software|xml|title)$/i;

function isInterestingExifKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    HIGHLIGHT_EXIF_KEY.test(key) ||
    lower.includes("xmp") ||
    lower.includes("prompt") ||
    lower.includes("negative") ||
    lower.includes("workflow") ||
    lower.includes("generation")
  );
}

export function pickHighlightedExifFields(
  exif: Record<string, unknown> | null,
): { key: string; value: string }[] {
  if (!exif) return [];
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(exif)) {
    if (!isInterestingExifKey(k)) continue;
    if (v === undefined || v === null) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v, null, 0);
    if (s.length > 8000) rows.push({ key: k, value: `${s.slice(0, 8000)}…` });
    else rows.push({ key: k, value: s });
  }
  return rows;
}

export function isLikelyAiPngKeyword(keyword: string): boolean {
  return /parameters|prompt|negative|sd-|seed|steps|sampler|model|dream|comfy|workflow|generation|aui/i.test(
    keyword,
  );
}

export async function readImageMetadataFile(file: File): Promise<ImageMetadataResult> {
  const buf = await file.arrayBuffer();
  const pngChunks = isPngBuffer(buf) ? await extractPngTextChunks(buf) : [];

  let exif: Record<string, unknown> | null = null;
  try {
    const data = await exifr.parse(file, {
      translateKeys: true,
      reviveValues: true,
      mergeOutput: true,
      iptc: true,
      xmp: true,
      icc: true,
      jfif: true,
    });
    if (data && typeof data === "object") exif = data as Record<string, unknown>;
  } catch {
    exif = null;
  }

  return { pngChunks, exif };
}
