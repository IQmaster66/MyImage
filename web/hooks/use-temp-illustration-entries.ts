"use client";

import {
  getAllTempIllustrations,
  subscribeTempIllustrationChanged,
  type TempIllustrationEntry,
} from "@/lib/temp-illustration-db";
import { useCallback, useEffect, useState } from "react";

export function useTempIllustrationEntries() {
  const [items, setItems] = useState<TempIllustrationEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof indexedDB === "undefined") {
      setItems([]);
      setReady(true);
      return;
    }
    try {
      setError(null);
      const all = await getAllTempIllustrations();
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
