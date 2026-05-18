import { getMlApiBase } from "@/lib/ml-api";
import type { CharacterEntry } from "@/lib/character-types";

type CharacterRow = {
  id: string;
  name: string;
  prompt: string;
  image_key: string;
  created_at: number;
  updated_at: number;
};

function toEntry(r: CharacterRow): CharacterEntry {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    imageKey: r.image_key,
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
  name: string;
  prompt: string;
  imageKey: string;
}): Promise<CharacterEntry> {
  const base = getMlApiBase();
  const body: { id?: string; name: string; prompt: string; image_key: string } = {
    name: input.name,
    prompt: input.prompt,
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

export async function updateCharacter(
  id: string,
  input: { name: string; prompt: string; imageKey: string },
): Promise<CharacterEntry> {
  const base = getMlApiBase();
  const res = await fetch(`${base}/characters/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      prompt: input.prompt,
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
