"use client";

import {
  createCharacterSource,
  deleteCharacterSourceApi,
  fetchCharacterSources,
  fetchCharacters,
  updateCharacterSource,
} from "@/lib/character-api";
import {
  buildSourceTree,
  countBySourceWithSubtree,
  ROOT_SOURCE_PARENT_ID,
  type CharacterSource,
  type SourceTreeNode,
} from "@/lib/character-types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SourceCounts = {
  total: number;
  uncategorized: number;
  byId: Record<string, number>;
  byIdSubtree: Record<string, number>;
};

export function useCharacterSources() {
  const [sources, setSources] = useState<CharacterSource[]>([]);
  const [counts, setCounts] = useState<SourceCounts>({
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
      const [srcs, entries] = await Promise.all([fetchCharacterSources(), fetchCharacters()]);
      setSources(srcs);
      setCounts(countBySourceWithSubtree(entries, srcs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载来源失败");
      setSources([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tree = useMemo(() => buildSourceTree(sources), [sources]);

  const addSource = useCallback(
    async (name: string, parentId: string = ROOT_SOURCE_PARENT_ID) => {
      const src = await createCharacterSource(name, parentId);
      await refresh();
      return src;
    },
    [refresh],
  );

  const renameSource = useCallback(
    async (id: string, name: string) => {
      const found = sources.find((c) => c.id === id);
      if (!found) return;
      await updateCharacterSource({
        ...found,
        name: name.trim() || found.name,
        updatedAt: Date.now(),
      });
      await refresh();
    },
    [sources, refresh],
  );

  const removeSource = useCallback(
    async (id: string) => {
      await deleteCharacterSourceApi(id);
      await refresh();
    },
    [refresh],
  );

  return {
    sources,
    tree: tree as SourceTreeNode[],
    counts,
    ready,
    error,
    refresh,
    addSource,
    renameSource,
    removeSource,
  };
}
