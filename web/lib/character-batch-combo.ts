import type { CharacterEntry } from "@/lib/character-types";

/** 拼接人物「不带服装」与共用段（不碰 clothed） */
export function joinUnclothedWithShared(
  unclothed: string,
  shared: string,
): string {
  const a = unclothed.replace(/\s+/g, " ").replace(/^[,，\s]+|[,，\s]+$/g, "").trim();
  const b = shared.replace(/\s+/g, " ").replace(/^[,，\s]+|[,，\s]+$/g, "").trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}, ${b}`;
}

export type BatchComboRow = {
  id: string;
  name: string;
  prompt: string;
};

export type BatchComboBuildResult = {
  rows: BatchComboRow[];
  skipped: { id: string; name: string; reason: string }[];
};

export function buildBatchComboRows(
  characters: CharacterEntry[],
  shared: string,
): BatchComboBuildResult {
  const sharedTrim = shared.trim();
  const rows: BatchComboRow[] = [];
  const skipped: BatchComboBuildResult["skipped"] = [];

  for (const c of characters) {
    const unclothed = (c.promptUnclothed || "").trim();
    if (!unclothed) {
      skipped.push({ id: c.id, name: c.name, reason: "无「不带服装」提示词" });
      continue;
    }
    rows.push({
      id: c.id,
      name: c.name.trim() || "未命名",
      prompt: joinUnclothedWithShared(unclothed, sharedTrim),
    });
  }
  return { rows, skipped };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safeHeading(text: string): string {
  return text.replace(/\s+/g, " ").replace(/#/g, "＃").trim() || "未命名";
}

function fence(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trimEnd();
  let ticks = "```";
  while (text.includes(ticks)) ticks += "`";
  return `${ticks}text\n${text || "（空）"}\n${ticks}`;
}

/** 生成批量搭配 Markdown */
export function formatBatchComboMarkdown(options: {
  shared: string;
  scopeLabel: string;
  rows: BatchComboRow[];
  skipped: BatchComboBuildResult["skipped"];
}): string {
  const lines: string[] = [
    `# 人物百科 · 批量搭配`,
    ``,
    `- 导出时间：${stamp()}`,
    `- 范围：${options.scopeLabel}`,
    `- 人物词：仅「不带服装」`,
    `- 已搭配：${options.rows.length} 人`,
    `- 已跳过：${options.skipped.length} 人`,
    ``,
    `## 共用段`,
    ``,
    fence(options.shared.trim()),
    ``,
  ];

  for (const row of options.rows) {
    lines.push(`## ${safeHeading(row.name)}`, ``, fence(row.prompt), ``);
  }

  if (options.skipped.length) {
    lines.push(`## 已跳过`, ``);
    for (const s of options.skipped) {
      lines.push(`- ${safeHeading(s.name)}：${s.reason}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function batchComboMdFilename(d = new Date()): string {
  return `人物搭配-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.md`;
}
