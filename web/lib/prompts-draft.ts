const KEY = "myimage-prompts-workbench-draft";
const LAYOUT_KEY = "myimage-prompts-workbench-layout";

export type WorkbenchDraft = {
  positive: string;
  negative: string;
  updatedAt: number;
};

export type WorkbenchLayout = {
  /** 正向框高度（px） */
  positiveHeight: number;
  /** 负向框高度（px） */
  negativeHeight: number;
};

const DEFAULT_LAYOUT: WorkbenchLayout = {
  positiveHeight: 140,
  negativeHeight: 100,
};

export function loadWorkbenchDraft(): WorkbenchDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WorkbenchDraft>;
    if (typeof o.positive !== "string" || typeof o.negative !== "string") return null;
    return {
      positive: o.positive,
      negative: o.negative,
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveWorkbenchDraft(draft: Omit<WorkbenchDraft, "updatedAt">): void {
  if (typeof localStorage === "undefined") return;
  const payload: WorkbenchDraft = {
    ...draft,
    updatedAt: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadWorkbenchLayout(): WorkbenchLayout {
  if (typeof localStorage === "undefined") return { ...DEFAULT_LAYOUT };
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const o = JSON.parse(raw) as Partial<WorkbenchLayout>;
    return {
      positiveHeight:
        typeof o.positiveHeight === "number" && o.positiveHeight >= 64
          ? o.positiveHeight
          : DEFAULT_LAYOUT.positiveHeight,
      negativeHeight:
        typeof o.negativeHeight === "number" && o.negativeHeight >= 64
          ? o.negativeHeight
          : DEFAULT_LAYOUT.negativeHeight,
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveWorkbenchLayout(layout: WorkbenchLayout): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

/** 从词库条目追加到工作台文本框 */
export const WORKBENCH_APPEND_EVENT = "myimage-prompts-workbench-append";

export type WorkbenchAppendDetail = {
  target: "positive" | "negative";
  text: string;
};

export function appendToWorkbench(target: "positive" | "negative", text: string): void {
  if (typeof window === "undefined") return;
  const detail: WorkbenchAppendDetail = { target, text };
  window.dispatchEvent(new CustomEvent(WORKBENCH_APPEND_EVENT, { detail }));
}
