"use client";

import { fetchCharacters } from "@/lib/character-api";
import type { CharacterEntry } from "@/lib/character-types";
import { useCallback, useEffect, useState } from "react";

export function useCharacterEntries() {
  const [items, setItems] = useState<CharacterEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const all = await fetchCharacters();
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

  return { items, ready, error, refresh };
}
