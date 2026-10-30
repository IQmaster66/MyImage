"use client";

import {
  fetchTempIllustrations,
  subscribeTempIllustrationChanged,
} from "@/lib/temp-illustration-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";
import { useCallback, useEffect, useState } from "react";

export function useTempIllustrationEntries() {
  const [items, setItems] = useState<TempIllustrationEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const all = await fetchTempIllustrations();
      setItems(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeTempIllustrationChanged(() => void refresh()), [refresh]);

  return { items, ready, error, refresh };
}
