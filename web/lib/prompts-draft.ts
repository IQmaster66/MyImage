const KEY = "myimage-prompts-workbench-draft";

export type WorkbenchDraft = {
  positive: string;
  negative: string;
  updatedAt: number;
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
