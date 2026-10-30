/** 正整数像素上限（用于最大宽/高输入框） */
export function parseMaxDimension(v: string): number | undefined {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
