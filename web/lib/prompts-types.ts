export type PromptKind = "positive" | "negative" | "full";

/** 未分类：存库用空字符串，侧栏用此常量筛选 */
export const UNCATEGORIZED_ID = "";

/** 根分类的 parentId */
export const ROOT_PARENT_ID = "";

/** 最多几级（含顶级）。例如 3 = 人物属性 → 发型 → 长发 */
export const MAX_CATEGORY_DEPTH = 3;

export type PromptCategory = {
  id: string;
  name: string;
  /** 父分类 id；空字符串表示顶级 */
  parentId: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type CategoryTreeNode = PromptCategory & { children: CategoryTreeNode[] };

export type PromptEntry = {
  id: string;
  title: string;
  body: string;
  kind: PromptKind;
  /** 所属分类 id；空字符串表示未分类 */
  categoryId: string;
  tags: string[];
  favorited: boolean;
  /** MinIO 对象键（prompt-previews/…） */
  previewImageKey?: string;
  /** @deprecated 旧版浏览器内嵌图，保存后会迁移为 MinIO */
  previewImage?: string;
  createdAt: number;
  updatedAt: number;
};

export const PROMPT_PREVIEW_KEY_PREFIX = "prompt-previews/";

export function isPromptPreviewObjectKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith(PROMPT_PREVIEW_KEY_PREFIX) && !k.includes("..") && !k.includes("\\");
}

export function entryHasPromptPreview(entry: PromptEntry): boolean {
  return Boolean(entry.previewImageKey?.trim() || entry.previewImage?.trim());
}

export const PROMPT_KIND_LABELS: Record<PromptKind, string> = {
  positive: "正向",
  negative: "负向",
  full: "整段 / 其它",
};

/** 首次安装时的预设顶级分类 */
export const DEFAULT_PROMPT_CATEGORIES: { name: string }[] = [
  { name: "人物外貌" },
  { name: "服装配饰" },
  { name: "姿态动作" },
  { name: "场景环境" },
  { name: "光影构图" },
  { name: "画风质量" },
  { name: "负面词" },
];

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,，;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCategoryId(raw: unknown): string {
  if (typeof raw !== "string") return UNCATEGORIZED_ID;
  return raw.trim();
}

export function normalizeParentId(raw: unknown): string {
  if (typeof raw !== "string") return ROOT_PARENT_ID;
  return raw.trim();
}

export function newPromptCategory(
  name: string,
  sortOrder: number,
  parentId: string = ROOT_PARENT_ID,
): PromptCategory {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "未命名分类",
    parentId: normalizeParentId(parentId),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeCategory(raw: PromptCategory): PromptCategory {
  return {
    ...raw,
    name: (raw.name || "").trim() || "未命名分类",
    parentId: normalizeParentId(raw.parentId),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
  };
}

export function buildCategoryTree(categories: PromptCategory[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>();
  for (const c of categories) {
    const n = normalizeCategory(c);
    nodes.set(n.id, { ...n, children: [] });
  }
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: CategoryTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** 深度从 1 起（顶级 = 1） */
export function getCategoryDepth(categories: PromptCategory[], id: string): number {
  const byId = new Map(categories.map((c) => [c.id, normalizeCategory(c)]));
  let depth = 0;
  let cur = id;
  const seen = new Set<string>();
  while (cur && byId.has(cur)) {
    if (seen.has(cur)) break;
    seen.add(cur);
    depth += 1;
    cur = byId.get(cur)!.parentId;
  }
  return depth;
}

/** 含自身与全部子孙 */
export function getDescendantIds(categories: PromptCategory[], rootId: string): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const c of categories) {
    const p = normalizeParentId(c.parentId);
    const list = childrenMap.get(p) ?? [];
    list.push(c.id);
    childrenMap.set(p, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    const kids = childrenMap.get(id);
    if (kids) for (const k of kids) stack.push(k);
  }
  return out;
}

export function getCategoryPath(categories: PromptCategory[], id: string): PromptCategory[] {
  const byId = new Map(categories.map((c) => [c.id, normalizeCategory(c)]));
  const path: PromptCategory[] = [];
  let cur = id;
  const seen = new Set<string>();
  while (cur && byId.has(cur)) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const node = byId.get(cur)!;
    path.unshift(node);
    cur = node.parentId;
  }
  return path;
}

export function formatCategoryPath(categories: PromptCategory[], id: string): string {
  return getCategoryPath(categories, id)
    .map((c) => c.name)
    .join(" / ");
}

/** 下拉选项：按树序扁平化，带缩进标签 */
export function flattenCategoryOptions(
  categories: PromptCategory[],
): { id: string; label: string; depth: number }[] {
  const tree = buildCategoryTree(categories);
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: CategoryTreeNode[], depth: number) => {
    for (const n of nodes) {
      const indent = depth > 1 ? `${"— ".repeat(depth - 1)}` : "";
      out.push({ id: n.id, label: `${indent}${n.name}`, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 1);
  return out;
}

export function newPromptEntry(partial: {
  title: string;
  body: string;
  kind: PromptKind;
  categoryId?: string;
  tags?: string[];
  favorited?: boolean;
  previewImageKey?: string;
}): PromptEntry {
  const now = Date.now();
  const entry: PromptEntry = {
    id: crypto.randomUUID(),
    title: partial.title.trim() || "未命名",
    body: partial.body,
    kind: partial.kind,
    categoryId: normalizeCategoryId(partial.categoryId),
    tags: partial.tags ?? [],
    favorited: partial.favorited ?? false,
    createdAt: now,
    updatedAt: now,
  };
  const key = partial.previewImageKey?.trim();
  if (key && isPromptPreviewObjectKey(key)) entry.previewImageKey = key;
  return entry;
}
