import { fileToUploadableImageBlob } from "@/lib/character-image";
import { deleteMinioObject, getMlApiBase, postUploadCharacterImage } from "@/lib/ml-api";
import type { CharacterEntry, CharacterSource } from "@/lib/character-types";

type CharacterRow = {
  id: string;
  name: string;
  prompt: string;
  prompt_clothed?: string | null;
  prompt_unclothed?: string | null;
  source_id?: string | null;
  image_key: string;
  created_at: number;
  updated_at: number;
};

type SourceRow = {
  id: string;
  name: string;
  parent_id: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

function toEntry(r: CharacterRow): CharacterEntry {
  const clothed = (r.prompt_clothed ?? r.prompt ?? "").trim();
  const unclothed = (r.prompt_unclothed ?? "").trim();
  return {
    id: r.id,
    name: r.name,
    prompt: clothed,
    promptClothed: clothed,
    promptUnclothed: unclothed,
    sourceId: (r.source_id ?? "").trim(),
    imageKey: r.image_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSource(r: SourceRow): CharacterSource {
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id || "",
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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

export async function fetchCharacters(): Promise<CharacterEntry[]> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters`);
  const data = await parseJsonOrThrow(res);
  return (data as CharacterRow[]).map(toEntry);
}

export async function createCharacter(input: {
  id?: string;
  name?: string | null;
  promptClothed?: string | null;
  promptUnclothed?: string | null;
  sourceId?: string | null;
  imageKey: string;
}): Promise<CharacterEntry> {
  const base = getMlApiBase();
  const clothed = (input.promptClothed ?? "").trim();
  const unclothed = (input.promptUnclothed ?? "").trim();
  const body: {
    id?: string;
    name: string;
    prompt_clothed: string;
    prompt_unclothed: string;
    prompt: string;
    source_id: string;
    image_key: string;
  } = {
    name: (input.name ?? "").trim(),
    prompt_clothed: clothed,
    prompt_unclothed: unclothed,
    prompt: clothed,
    source_id: (input.sourceId ?? "").trim(),
    image_key: input.imageKey,
  };
  if (input.id) body.id = input.id;
  const res = await fetch(`${base}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJsonOrThrow(res);
  return toEntry(data as CharacterRow);
}

/** 工具箱快捷入库：仅上传图片，名称 / 提示词 / 出自均为空 */
export async function saveCharacterFromBlob(file: File): Promise<CharacterEntry> {
  const { blob, filename } = await fileToUploadableImageBlob(file);
  const { object_key } = await postUploadCharacterImage(blob, filename);
  try {
    return await createCharacter({
      id: crypto.randomUUID(),
      name: "",
      promptClothed: "",
      promptUnclothed: "",
      sourceId: "",
      imageKey: object_key,
    });
  } catch (e) {
    void deleteMinioObject(object_key).catch(() => {});
    throw e;
  }
}

export async function updateCharacter(
  id: string,
  input: {
    name: string;
    promptClothed: string;
    promptUnclothed: string;
    sourceId?: string;
    imageKey: string;
  },
): Promise<CharacterEntry> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      prompt_clothed: input.promptClothed,
      prompt_unclothed: input.promptUnclothed,
      prompt: input.promptClothed,
      source_id: (input.sourceId ?? "").trim(),
      image_key: input.imageKey,
    }),
  });
  const data = await parseJsonOrThrow(res);
  return toEntry(data as CharacterRow);
}

export async function deleteCharacterApi(id: string): Promise<void> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(res);
}

export async function deleteAllCharactersApi(): Promise<number> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/all`, { method: "DELETE" });
  const data = (await parseJsonOrThrow(res)) as { deleted?: number };
  return typeof data?.deleted === "number" ? data.deleted : 0;
}

export type CharacterReencodeResult = {
  total: number;
  converted: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
};

/** 服务端批量将人物配图转为 JPEG */
export async function reencodeCharacterImages(options?: {
  quality?: number;
  maxEdge?: number;
  skipAlreadyJpeg?: boolean;
  force?: boolean;
}): Promise<CharacterReencodeResult> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/reencode-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quality: options?.quality ?? 85,
      max_edge: options?.maxEdge ?? 2000,
      skip_already_jpeg: options?.skipAlreadyJpeg ?? false,
      force: options?.force ?? false,
    }),
  });
  const data = (await parseJsonOrThrow(res)) as {
    total: number;
    converted: number;
    skipped: number;
    failed: number;
    bytes_before: number;
    bytes_after: number;
  };
  return {
    total: data.total,
    converted: data.converted,
    skipped: data.skipped,
    failed: data.failed,
    bytesBefore: data.bytes_before,
    bytesAfter: data.bytes_after,
  };
}

export async function fetchCharacterSources(): Promise<CharacterSource[]> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/sources`);
  const data = await parseJsonOrThrow(res);
  return (data as SourceRow[]).map(toSource);
}

export async function createCharacterSource(
  name: string,
  parentId: string = "",
): Promise<CharacterSource> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), parent_id: parentId.trim() }),
  });
  const data = await parseJsonOrThrow(res);
  return toSource(data as SourceRow);
}

export async function updateCharacterSource(source: CharacterSource): Promise<CharacterSource> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/sources/${encodeURIComponent(source.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: source.name,
      parent_id: source.parentId,
      sort_order: source.sortOrder,
      created_at: source.createdAt,
      updated_at: source.updatedAt,
    }),
  });
  const data = await parseJsonOrThrow(res);
  return toSource(data as SourceRow);
}

export async function deleteCharacterSourceApi(id: string): Promise<void> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(res);
}
