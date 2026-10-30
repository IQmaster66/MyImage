"use client";

import { getAllPrompts, queryPrompts, subscribePromptsChanged, type PromptQuery } from "@/lib/prompts-db";
import type { PromptEntry } from "@/lib/prompts-types";
import { useCallback, useEffect, useState } from "react";

export function usePromptEntries(query: PromptQuery) {
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const all = await getAllPrompts();
      setItems(queryPrompts(all, query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setReady(true);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribePromptsChanged(() => void refresh()), [refresh]);

  return { items, ready, error, refresh };
}
