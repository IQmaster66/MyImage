import { deleteMinioObject, fetchMinioReadUrl } from "@/lib/ml-api";
import { isPromptPreviewObjectKey, type PromptEntry } from "@/lib/prompts-types";

export async function tryDeletePromptPreviewKey(key: string | undefined): Promise<void> {
  if (!key || !isPromptPreviewObjectKey(key)) return;
  try {
    await deleteMinioObject(key);
  } catch {
    // API 不可用时仍允许删除词库条目
  }
}

/** 解析条目效果图 URL（MinIO 预签名或旧版 data URL） */
export async function resolvePromptPreviewSrc(entry: PromptEntry): Promise<string | null> {
  const legacy = entry.previewImage?.trim();
  if (legacy?.startsWith("data:image/")) return legacy;
  const key = entry.previewImageKey?.trim();
  if (!key || !isPromptPreviewObjectKey(key)) return null;
  try {
    return await fetchMinioReadUrl(key);
  } catch {
    return null;
  }
}
