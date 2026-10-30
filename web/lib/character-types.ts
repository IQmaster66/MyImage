export type CharacterEntry = {
  id: string;
  name: string;
  /** @deprecated 等同 promptClothed，保留兼容旧展示 */
  prompt: string;
  /** 带服装提示词 */
  promptClothed: string;
  /** 不带服装提示词 */
  promptUnclothed: string;
  /** 出自来源 id；空字符串表示未归类 */
  sourceId: string;
  /** MinIO 对象键 */
  imageKey: string;
  createdAt: number;
  updatedAt: number;
};

/** 未归类：存库用空字符串，侧栏用此常量筛选 */
export const UNCATEGORIZED_SOURCE_ID = "";

/** 根来源的 parentId */
export const ROOT_SOURCE_PARENT_ID = "";

/** 最多几级（含顶级） */
export const MAX_SOURCE_DEPTH = 3;

export type CharacterSource = {
  id: string;
  name: string;
  /** 父来源 id；空字符串表示顶级 */
  parentId: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type SourceTreeNode = CharacterSource & { children: SourceTreeNode[] };

export function characterHasImage(e: CharacterEntry): boolean {
  return Boolean(e.imageKey?.trim());
}

export function characterPromptPreview(e: CharacterEntry): string {
  return e.promptClothed.trim() || e.promptUnclothed.trim() || e.prompt.trim();
}

export function normalizeSourceId(raw: unknown): string {
  if (typeof raw !== "string") return UNCATEGORIZED_SOURCE_ID;
  return raw.trim();
}

export function normalizeSourceParentId(raw: unknown): string {
  if (typeof raw !== "string") return ROOT_SOURCE_PARENT_ID;
  return raw.trim();
}

export function normalizeSource(raw: CharacterSource): CharacterSource {
  return {
    ...raw,
    name: (raw.name || "").trim() || "未命名来源",
    parentId: normalizeSourceParentId(raw.parentId),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
  };
}

export function buildSourceTree(sources: CharacterSource[]): SourceTreeNode[] {
  const nodes = new Map<string, SourceTreeNode>();
  for (const c of sources) {
    const n = normalizeSource(c);
    nodes.set(n.id, { ...n, children: [] });
  }
  const roots: SourceTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: SourceTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** 深度从 1 起（顶级 = 1） */
export function getSourceDepth(sources: CharacterSource[], id: string): number {
  const byId = new Map(sources.map((c) => [c.id, normalizeSource(c)]));
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
export function getSourceDescendantIds(sources: CharacterSource[], rootId: string): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const c of sources) {
    const p = normalizeSourceParentId(c.parentId);
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

export function getSourcePath(sources: CharacterSource[], id: string): CharacterSource[] {
  const byId = new Map(sources.map((c) => [c.id, normalizeSource(c)]));
  const path: CharacterSource[] = [];
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

export function formatSourcePath(sources: CharacterSource[], id: string): string {
  return getSourcePath(sources, id)
    .map((c) => c.name)
    .join(" / ");
}

/** 下拉选项：按树序扁平化，带缩进标签 */
export function flattenSourceOptions(
  sources: CharacterSource[],
): { id: string; label: string; depth: number }[] {
  const tree = buildSourceTree(sources);
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: SourceTreeNode[], depth: number) => {
    for (const n of nodes) {
      const indent = depth > 1 ? `${"— ".repeat(depth - 1)}` : "";
      out.push({ id: n.id, label: `${indent}${n.name}`, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 1);
  return out;
}

export function countBySourceWithSubtree(
  entries: CharacterEntry[],
  sources: CharacterSource[],
): {
  total: number;
  uncategorized: number;
  byId: Record<string, number>;
  byIdSubtree: Record<string, number>;
} {
  const byId: Record<string, number> = {};
  let uncategorized = 0;
  for (const e of entries) {
    const sid = normalizeSourceId(e.sourceId);
    if (!sid) {
      uncategorized += 1;
      continue;
    }
    byId[sid] = (byId[sid] ?? 0) + 1;
  }
  const byIdSubtree: Record<string, number> = {};
  for (const s of sources) {
    const ids = getSourceDescendantIds(sources, s.id);
    byIdSubtree[s.id] = ids.reduce((sum, id) => sum + (byId[id] ?? 0), 0);
  }
  return {
    total: entries.length,
    uncategorized,
    byId,
    byIdSubtree,
  };
}
