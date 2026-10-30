"use client";

import {
  countByCategoryWithSubtree,
  createCategory,
  deleteCategory,
  getAllCategories,
  getAllPrompts,
  putCategory,
  subscribePromptsChanged,
} from "@/lib/prompts-db";
import {
  buildCategoryTree,
  ROOT_PARENT_ID,
  type CategoryTreeNode,
  type PromptCategory,
} from "@/lib/prompts-types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type CategoryCounts = {
  total: number;
  uncategorized: number;
  byId: Record<string, number>;
  byIdSubtree: Record<string, number>;
};

export function usePromptCategories() {
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [counts, setCounts] = useState<CategoryCounts>({
    total: 0,
    uncategorized: 0,
    byId: {},
    byIdSubtree: {},
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [cats, entries] = await Promise.all([getAllCategories(), getAllPrompts()]);
      setCategories(cats);
      setCounts(countByCategoryWithSubtree(entries, cats));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载分类失败");
      setCategories([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribePromptsChanged(() => void refresh()), [refresh]);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  const addCategory = useCallback(
    async (name: string, parentId: string = ROOT_PARENT_ID) => {
      const cat = await createCategory(name, parentId);
      await refresh();
      return cat;
    },
    [refresh],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const found = categories.find((c) => c.id === id);
      if (!found) return;
      await putCategory({ ...found, name: name.trim() || found.name, updatedAt: Date.now() });
      await refresh();
    },
    [categories, refresh],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      await deleteCategory(id);
      await refresh();
    },
    [refresh],
  );

  return {
    categories,
    tree: tree as CategoryTreeNode[],
    counts,
    ready,
    error,
    refresh,
    addCategory,
    renameCategory,
    removeCategory,
  };
}
