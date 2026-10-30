"use client";

import { PromptConfirmDialog } from "@/components/prompts/prompt-confirm-dialog";
import { useCharacterSources } from "@/hooks/use-character-sources";
import {
  getSourceDepth,
  getSourceDescendantIds,
  MAX_SOURCE_DEPTH,
  ROOT_SOURCE_PARENT_ID,
  UNCATEGORIZED_SOURCE_ID,
  type SourceTreeNode,
} from "@/lib/character-types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const EXPANDED_KEY = "myimage-character-source-expanded";

function sourceHref(sourceId: string | null): string {
  if (sourceId === null) return "/character";
  if (sourceId === UNCATEGORIZED_SOURCE_ID) return "/character?source=uncategorized";
  return `/character?source=${encodeURIComponent(sourceId)}`;
}

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveExpanded(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function CharacterSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    sources,
    tree,
    counts,
    ready,
    addSource,
    renameSource,
    removeSource,
  } = useCharacterSources();

  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    childCount: number;
    characterCount: number;
    subtree: string[];
  } | null>(null);

  useEffect(() => {
    setExpanded(loadExpanded());
  }, []);

  const selectedRaw = searchParams.get("source");
  const selectedSource: string | null =
    selectedRaw === null
      ? null
      : selectedRaw === "uncategorized"
        ? UNCATEGORIZED_SOURCE_ID
        : selectedRaw;

  useEffect(() => {
    if (!selectedSource) return;
    const pathParents: string[] = [];
    let cur = sources.find((c) => c.id === selectedSource)?.parentId ?? "";
    while (cur) {
      pathParents.push(cur);
      cur = sources.find((c) => c.id === cur)?.parentId ?? "";
    }
    if (!pathParents.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of pathParents) next.add(id);
      saveExpanded(next);
      return next;
    });
  }, [selectedSource, sources]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpanded(next);
      return next;
    });
  };

  const startAdd = (parentId: string) => {
    setAddingParentId(parentId);
    setNewName("");
    setAddError(null);
  };

  const submitAdd = async () => {
    const name = newName.trim();
    if (!name || addingParentId === null) return;
    try {
      setAddError(null);
      const src = await addSource(name, addingParentId);
      if (addingParentId) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(addingParentId);
          saveExpanded(next);
          return next;
        });
      }
      setNewName("");
      setAddingParentId(null);
      router.push(sourceHref(src.id));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "添加失败");
    }
  };

  const submitRename = async (id: string) => {
    const name = renameDraft.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    await renameSource(id, name);
    setRenamingId(null);
  };

  const renderAddRow = (parentId: string) => {
    if (addingParentId !== parentId) return null;
    return (
      <div
        className={`mb-1 flex flex-col gap-1 ${parentId ? "ml-3 border-l border-emerald-100 pl-2 dark:border-emerald-900/40" : ""}`}
      >
        <div className="flex gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={parentId ? "子来源名称" : "作品 / 出处名称"}
            className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitAdd();
              if (e.key === "Escape") {
                setAddingParentId(null);
                setAddError(null);
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={() => void submitAdd()}
            className="shrink-0 rounded bg-emerald-600 px-2 py-1 text-[11px] text-white"
          >
            添加
          </button>
        </div>
        {addError ? <p className="text-[10px] text-red-600 dark:text-red-400">{addError}</p> : null}
      </div>
    );
  };

  const renderNode = (node: SourceTreeNode, depth: number) => {
    const active = selectedSource === node.id;
    const count = counts.byIdSubtree[node.id] ?? counts.byId[node.id] ?? 0;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const canAddChild = getSourceDepth(sources, node.id) < MAX_SOURCE_DEPTH;

    if (renamingId === node.id) {
      return (
        <div key={node.id} className="flex gap-1 px-0.5 py-1" style={{ paddingLeft: (depth - 1) * 10 }}>
          <input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename(node.id);
              if (e.key === "Escape") setRenamingId(null);
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={() => void submitRename(node.id)}
            className="rounded bg-emerald-600 px-1.5 text-[10px] text-white"
          >
            存
          </button>
        </div>
      );
    }

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-0.5 rounded-lg ${
            active ? "bg-emerald-50 dark:bg-emerald-950/50" : ""
          }`}
          style={{ paddingLeft: (depth - 1) * 8 }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isOpen ? "折叠" : "展开"}
              onClick={() => toggleExpand(node.id)}
              className="flex h-6 w-5 shrink-0 items-center justify-center text-[10px] text-gray-400 hover:text-emerald-700"
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block w-5 shrink-0" />
          )}
          <Link
            href={sourceHref(node.id)}
            className={`flex min-w-0 flex-1 items-center justify-between py-1.5 pr-1 text-sm ${
              active
                ? "font-medium text-emerald-800 dark:text-emerald-100"
                : "text-gray-700 hover:text-emerald-700 dark:text-gray-300 dark:hover:text-emerald-400"
            }`}
          >
            <span className="truncate">{node.name}</span>
            <span className="ml-1 shrink-0 tabular-nums text-[11px] text-gray-400">{count}</span>
          </Link>
          <div className="flex shrink-0 pr-1">
            {canAddChild ? (
              <button
                type="button"
                title="添加子来源"
                onClick={() => startAdd(node.id)}
                className="rounded px-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              title="重命名"
              onClick={() => {
                setRenamingId(node.id);
                setRenameDraft(node.name);
              }}
              className="hidden rounded px-1 text-[10px] text-gray-500 hover:bg-gray-100 sm:inline dark:hover:bg-zinc-800 sm:opacity-0 sm:group-hover:opacity-100"
            >
              改
            </button>
            <button
              type="button"
              title="删除来源"
              onClick={() => {
                const subtree = getSourceDescendantIds(sources, node.id);
                setPendingDelete({
                  id: node.id,
                  name: node.name,
                  childCount: Math.max(0, subtree.length - 1),
                  characterCount: count,
                  subtree,
                });
              }}
              className="rounded px-1 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              删
            </button>
          </div>
        </div>
        {renderAddRow(node.id)}
        {hasChildren && isOpen
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-b border-emerald-200/90 bg-white/95 p-4 shadow-sm sm:sticky sm:top-16 sm:z-30 sm:w-72 sm:shrink-0 sm:self-start sm:border-r sm:border-b-0 sm:shadow-none dark:border-emerald-900/50 dark:bg-zinc-900/95"
      aria-label="人物百科导航"
    >
      <div className="mb-3 border-b border-emerald-100 px-1 pb-3 dark:border-emerald-900/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          人物百科
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">按角色出处分组</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            出自
          </p>
          <button
            type="button"
            onClick={() => {
              if (addingParentId === ROOT_SOURCE_PARENT_ID) {
                setAddingParentId(null);
                setAddError(null);
              } else {
                startAdd(ROOT_SOURCE_PARENT_ID);
              }
            }}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            {addingParentId === ROOT_SOURCE_PARENT_ID ? "取消" : "新建"}
          </button>
        </div>

        {renderAddRow(ROOT_SOURCE_PARENT_ID)}

        <nav
          className="flex max-h-64 flex-col gap-0.5 overflow-y-auto sm:max-h-[calc(100dvh-11rem)] sm:flex-1"
          aria-label="角色出自"
        >
          <Link
            href={sourceHref(null)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              selectedSource === null
                ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
            }`}
          >
            <span>全部</span>
            <span className="tabular-nums text-[11px] text-gray-400">{ready ? counts.total : "—"}</span>
          </Link>
          <Link
            href={sourceHref(UNCATEGORIZED_SOURCE_ID)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              selectedSource === UNCATEGORIZED_SOURCE_ID
                ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
            }`}
          >
            <span>未归类</span>
            <span className="tabular-nums text-[11px] text-gray-400">
              {ready ? counts.uncategorized : "—"}
            </span>
          </Link>
          {tree.map((node) => renderNode(node, 1))}
        </nav>
        <p className="mt-2 hidden px-1 text-[10px] leading-relaxed text-gray-400 sm:block">
          新建作品 / 系列作为「出自」。悬停点「+」可加子分类（最多 {MAX_SOURCE_DEPTH}{" "}
          级）。点选父项会显示其下全部角色。
        </p>
      </div>

      <PromptConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? pendingDelete.childCount > 0
              ? `删除「${pendingDelete.name}」及其子项？`
              : `删除出自「${pendingDelete.name}」？`
            : "删除出自？"
        }
        description={
          pendingDelete
            ? pendingDelete.childCount > 0
              ? `将同时删除 ${pendingDelete.childCount} 个子项。相关 ${pendingDelete.characterCount} 位角色会移到「未归类」。`
              : `其中 ${pendingDelete.characterCount} 位角色会移到「未归类」。来源本身无法恢复。`
            : ""
        }
        confirmLabel="删除出自"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const pending = pendingDelete;
          if (!pending) return;
          setPendingDelete(null);
          void removeSource(pending.id).then(() => {
            if (selectedSource && pending.subtree.includes(selectedSource)) {
              router.push(sourceHref(null));
            }
          });
        }}
      />
    </aside>
  );
}
