import {
  buildCategoryTree,
  PROMPT_KIND_LABELS,
  type CategoryTreeNode,
  type PromptCategory,
  type PromptEntry,
  type PromptKind,
} from "@/lib/prompts-types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatExportStamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 避免标题里的 `#` / 换行破坏结构 */
function safeHeading(text: string): string {
  return text.replace(/\s+/g, " ").replace(/#/g, "＃").trim() || "未命名";
}

function fenceBody(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trimEnd();
  let ticks = "```";
  while (text.includes(ticks)) ticks += "`";
  return `${ticks}text\n${text || "（空）"}\n${ticks}`;
}

function kindBadge(kind: PromptKind): string {
  return PROMPT_KIND_LABELS[kind] ?? kind;
}

function sortEntries(a: PromptEntry, b: PromptEntry): number {
  if (a.favorited !== b.favorited) return a.favorited ? -1 : 1;
  const kindOrder: Record<PromptKind, number> = { positive: 0, negative: 1, full: 2 };
  const kd = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
  if (kd !== 0) return kd;
  return a.title.localeCompare(b.title, "zh-CN") || b.updatedAt - a.updatedAt;
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u4e00-\u9fff-]+/g, "")
      .slice(0, 48) || "section"
  );
}

function uniqueAnchor(base: string, used: Set<string>): string {
  let anchor = base;
  let n = 2;
  while (used.has(anchor)) {
    anchor = `${base}-${n++}`;
  }
  used.add(anchor);
  return anchor;
}

function countDirect(byCategory: Map<string, PromptEntry[]>, id: string): number {
  return byCategory.get(id)?.length ?? 0;
}

function countSubtree(node: CategoryTreeNode, byCategory: Map<string, PromptEntry[]>): number {
  let n = countDirect(byCategory, node.id);
  for (const c of node.children) n += countSubtree(c, byCategory);
  return n;
}

function formatEntry(entry: PromptEntry, headingLevel: number): string {
  const level = Math.min(Math.max(headingLevel, 2), 6);
  const hashes = "#".repeat(level);
  const title = safeHeading(entry.title);
  const lines: string[] = [
    `${hashes} ${title}${entry.favorited ? " ★" : ""}`,
    "",
    `| 类型 | 收藏 | 更新 |`,
    `| :---: | :---: | --- |`,
    `| **${kindBadge(entry.kind)}** | ${entry.favorited ? "是" : "—"} | ${new Date(entry.updatedAt).toLocaleString("zh-CN")} |`,
    "",
  ];

  if (entry.tags.length) {
    lines.push(`**标签**　${entry.tags.map((t) => `\`${t.replace(/`/g, "'")}\``).join(" · ")}`);
    lines.push("");
  }

  lines.push(fenceBody(entry.body));
  lines.push("");
  return lines.join("\n");
}

type SectionPlan = {
  id: string;
  name: string;
  depth: number;
  anchor: string;
  directCount: number;
  entries: PromptEntry[];
  children: SectionPlan[];
};

function planTree(
  nodes: CategoryTreeNode[],
  byCategory: Map<string, PromptEntry[]>,
  depth: number,
  usedAnchors: Set<string>,
): SectionPlan[] {
  const out: SectionPlan[] = [];
  for (const node of nodes) {
    if (countSubtree(node, byCategory) === 0) continue;
    const entries = [...(byCategory.get(node.id) ?? [])].sort(sortEntries);
    out.push({
      id: node.id,
      name: node.name,
      depth,
      anchor: uniqueAnchor(slugify(node.name), usedAnchors),
      directCount: entries.length,
      entries,
      children: planTree(node.children, byCategory, depth + 1, usedAnchors),
    });
  }
  return out;
}

function renderToc(sections: SectionPlan[], includeUncategorized: number): string[] {
  const lines: string[] = ["## 目录", ""];
  const walk = (list: SectionPlan[]) => {
    for (const s of list) {
      const indent = "  ".repeat(s.depth);
      const countLabel = s.directCount > 0 ? `（${s.directCount}）` : "";
      lines.push(`${indent}- [${safeHeading(s.name)}](#${s.anchor}) ${countLabel}`.trimEnd());
      walk(s.children);
    }
  };
  walk(sections);
  if (includeUncategorized > 0) {
    lines.push(`- [未分类](#uncategorized)（${includeUncategorized}）`);
  }
  lines.push("");
  return lines;
}

function renderSections(sections: SectionPlan[], parts: string[]) {
  for (const s of sections) {
    const level = Math.min(s.depth + 2, 4); // root → ##
    const hashes = "#".repeat(level);
    parts.push(`<a id="${s.anchor}"></a>`);
    parts.push("");
    parts.push(`${hashes} ${safeHeading(s.name)}`);
    parts.push("");

    if (s.entries.length === 0 && s.children.length > 0) {
      parts.push(`*本层无片段，见下方子分类。*`);
      parts.push("");
    }

    for (const entry of s.entries) {
      parts.push(formatEntry(entry, level + 1));
      parts.push("---");
      parts.push("");
    }

    renderSections(s.children, parts);
  }
}

/**
 * 生成排版清晰的提示词 Markdown：封面摘要、目录、按分类树分组、代码块正文。
 */
export function formatPromptsMarkdown(
  categories: PromptCategory[],
  entries: PromptEntry[],
): string {
  const tree = buildCategoryTree(categories);
  const byCategory = new Map<string, PromptEntry[]>();
  const uncategorized: PromptEntry[] = [];

  for (const e of entries) {
    const cid = (e.categoryId || "").trim();
    if (!cid) {
      uncategorized.push(e);
      continue;
    }
    const list = byCategory.get(cid) ?? [];
    list.push(e);
    byCategory.set(cid, list);
  }
  uncategorized.sort(sortEntries);

  const favCount = entries.filter((e) => e.favorited).length;
  const kindCounts = {
    positive: entries.filter((e) => e.kind === "positive").length,
    negative: entries.filter((e) => e.kind === "negative").length,
    full: entries.filter((e) => e.kind === "full").length,
  };

  const usedAnchors = new Set<string>(["uncategorized"]);
  const sections = planTree(tree, byCategory, 0, usedAnchors);

  const parts: string[] = [];
  parts.push(`# MyImage 提示词词库`);
  parts.push("");
  parts.push(`> 导出时间：**${formatExportStamp()}**  `);
  parts.push(
    `> 共 **${entries.length}** 条 · 收藏 **${favCount}** · 正向 ${kindCounts.positive} · 负向 ${kindCounts.negative} · 其它 ${kindCounts.full}`,
  );
  parts.push("");
  parts.push(`---`);
  parts.push("");

  if (sections.length || uncategorized.length) {
    parts.push(...renderToc(sections, uncategorized.length));
    parts.push(`---`);
    parts.push("");
  }

  renderSections(sections, parts);

  if (uncategorized.length) {
    parts.push(`<a id="uncategorized"></a>`);
    parts.push("");
    parts.push(`## 未分类`);
    parts.push("");
    for (const entry of uncategorized) {
      parts.push(formatEntry(entry, 3));
      parts.push("---");
      parts.push("");
    }
  }

  if (!entries.length) {
    parts.push(`*词库为空。*`);
    parts.push("");
  }

  parts.push(`---`);
  parts.push("");
  parts.push(`*由 MyImage 提示词页导出 · 正文使用代码块便于一键复制*`);
  parts.push("");

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}
