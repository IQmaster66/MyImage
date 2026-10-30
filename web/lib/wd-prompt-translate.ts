import { postTranslate } from "@/lib/ml-api";

/** 将逗号分隔的英文标签串按长度分块，避免超过 Marian 输入上限 */
export function chunkCommaSeparatedTags(text: string, maxChunkLen: number): string[] {
  const tags = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tags.length) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;

  for (const tag of tags) {
    const sep = current.length ? 2 : 0;
    const add = sep + tag.length;
    if (current.length && len + add > maxChunkLen) {
      chunks.push(current.join(", "));
      current = [tag];
      len = tag.length;
    } else {
      current.push(tag);
      len += add;
    }
  }
  if (current.length) chunks.push(current.join(", "));
  return chunks;
}

/** 按逗号优先分块；无逗号时按字符长度切，避免超过 Marian 输入上限 */
export function chunkPromptForTranslate(text: string, maxChunkLen = 380): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.includes(",")) {
    const byComma = chunkCommaSeparatedTags(trimmed, maxChunkLen);
    if (byComma.length) return byComma;
  }
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxChunkLen) {
    chunks.push(trimmed.slice(i, i + maxChunkLen));
  }
  return chunks;
}

export async function translatePromptText(
  prompt: string,
  direction: "zh2en" | "en2zh",
): Promise<string> {
  const chunks = chunkPromptForTranslate(prompt, 380);
  if (!chunks.length) return "";

  const parts: string[] = [];
  for (const chunk of chunks) {
    parts.push(await postTranslate(chunk, direction));
  }
  const joined = parts
    .map((s) => s.trim())
    .filter(Boolean)
    .join(prompt.includes(",") ? ", " : "");
  return joined;
}

/** 将 WD 反推得到的英文 Danbooru 标签串译为中文（逗号分隔） */
export async function translateWdPromptEnToZh(prompt: string): Promise<string> {
  return translatePromptText(prompt, "en2zh");
}

export const WD_AUTO_TRANSLATE_ZH_KEY = "wd-auto-translate-zh";

export function readWdAutoTranslateZh(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(WD_AUTO_TRANSLATE_ZH_KEY) !== "false";
}

export function writeWdAutoTranslateZh(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WD_AUTO_TRANSLATE_ZH_KEY, enabled ? "true" : "false");
}
