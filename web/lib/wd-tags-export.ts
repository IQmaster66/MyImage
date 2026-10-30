/** WD14 标签排序与导出为 CSV / 逗号分隔串 */

export function sortWdTagsByWeight(tags: Record<string, number>): [string, number][] {
  return Object.entries(tags).sort((a, b) => b[1] - a[1]);
}

export function wdTagsToCsv(tags: Record<string, number>): string {
  const lines = [["tag", "weight"], ...sortWdTagsByWeight(tags)];
  return lines
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\r\n");
}

/** 按权重降序的 tag1, tag2, … 适合粘贴到提示词 */
export function wdTagsToCommaLine(tags: Record<string, number>): string {
  return sortWdTagsByWeight(tags)
    .map(([t]) => t)
    .join(", ");
}
