export type PromptKind = "positive" | "negative" | "full";

export type PromptEntry = {
  id: string;
  title: string;
  body: string;
  kind: PromptKind;
  tags: string[];
  favorited: boolean;
  createdAt: number;
  updatedAt: number;
};

export const PROMPT_KIND_LABELS: Record<PromptKind, string> = {
  positive: "正向",
  negative: "负向",
  full: "整段 / 其它",
};

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function newPromptEntry(partial: {
  title: string;
  body: string;
  kind: PromptKind;
  tags?: string[];
  favorited?: boolean;
}): PromptEntry {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: partial.title.trim() || "未命名",
    body: partial.body,
    kind: partial.kind,
    tags: partial.tags ?? [],
    favorited: partial.favorited ?? false,
    createdAt: now,
    updatedAt: now,
  };
}
