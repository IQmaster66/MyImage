"use client";

import { InspirationLinksList } from "@/components/inspiration-links-list";
import { PromptConfirmDialog } from "@/components/prompts/prompt-confirm-dialog";
import { usePromptCategories } from "@/hooks/use-prompt-categories";
import {
  getCategoryDepth,
  getDescendantIds,
  MAX_CATEGORY_DEPTH,
  ROOT_PARENT_ID,
  UNCATEGORIZED_ID,
  type CategoryTreeNode,
} from "@/lib/prompts-types";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/prompts", label: "词库", description: "编写与分类" },
  { href: "/prompts/favorites", label: "收藏", description: "常用片段" },
] as const;

const EXPANDED_KEY = "myimage-prompts-cat-expanded";

function isActive(pathname: string, href: string) {
  if (href === "/prompts") {
    return pathname === "/prompts" || pathname.startsWith("/prompts/categories");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function categoryHref(categoryId: string | null): string {
  if (categoryId === null) return "/prompts";
  if (categoryId === UNCATEGORIZED_ID) return "/prompts?category=uncategorized";
  return `/prompts?category=${encodeURIComponent(categoryId)}`;
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

export function PromptsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onLibrary =
    pathname === "/prompts" ||
    pathname === "/prompts/categories" ||
    pathname.startsWith("/prompts/categories/");
  const {
    categories,
    tree,
    counts,
    ready,
    addCategory,
    renameCategory,
    removeCategory,
  } = usePromptCategories();

  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<{
    id: string;
    name: string;
    childCount: number;
    snippetCount: number;
    subtree: string[];
  } | null>(null);

  useEffect(() => {
    setExpanded(loadExpanded());
  }, []);

  const selectedRaw = searchParams.get("category");
  const selectedCategory: string | null =
    !onLibrary
      ? null
      : selectedRaw === null
        ? null
        : selectedRaw === "uncategorized"
          ? UNCATEGORIZED_ID
          : selectedRaw;

  useEffect(() => {
    if (!selectedCategory) return;
    const pathParents: string[] = [];
    let cur = categories.find((c) => c.id === selectedCategory)?.parentId ?? "";
    while (cur) {
      pathParents.push(cur);
      cur = categories.find((c) => c.id === cur)?.parentId ?? "";
    }
    if (!pathParents.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of pathParents) next.add(id);
      saveExpanded(next);
      return next;
    });
  }, [selectedCategory, categories]);

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
      const cat = await addCategory(name, addingParentId);
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
      router.push(categoryHref(cat.id));
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
    await renameCategory(id, name);
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
            placeholder={parentId ? "二级分类名称" : "分类名称"}
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

  const renderNode = (node: CategoryTreeNode, depth: number) => {
    const active = selectedCategory === node.id;
    const count = counts.byIdSubtree[node.id] ?? counts.byId[node.id] ?? 0;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const canAddChild = getCategoryDepth(categories, node.id) < MAX_CATEGORY_DEPTH;

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
            href={categoryHref(node.id)}
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
                title="添加子分类"
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
              title="删除分类"
              onClick={() => {
                const subtree = getDescendantIds(categories, node.id);
                setPendingCategoryDelete({
                  id: node.id,
                  name: node.name,
                  childCount: Math.max(0, subtree.length - 1),
                  snippetCount: count,
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
      aria-label="提示词导航"
    >
      <div className="mb-3 border-b border-emerald-100 px-1 pb-3 dark:border-emerald-900/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          提示词
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">服务端 SQLite 词库</p>
      </div>
      <nav className="flex flex-row flex-wrap gap-1 sm:flex-col sm:flex-nowrap sm:gap-0.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors sm:py-2.5 ${
                active
                  ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "text-gray-700 hover:bg-gray-50 hover:text-emerald-700 dark:text-gray-300 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
              }`}
            >
              <span className="block leading-tight">{item.label}</span>
              <span className="mt-0.5 hidden text-[11px] text-gray-500 sm:block dark:text-gray-500">
                {item.description}
              </span>
            </Link>
          );
        })}
      </nav>

      {onLibrary ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-emerald-100 pt-3 dark:border-emerald-900/40">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              分类
            </p>
            <button
              type="button"
              onClick={() => {
                if (addingParentId === ROOT_PARENT_ID) {
                  setAddingParentId(null);
                  setAddError(null);
                } else {
                  startAdd(ROOT_PARENT_ID);
                }
              }}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              {addingParentId === ROOT_PARENT_ID ? "取消" : "新建"}
            </button>
          </div>

          {renderAddRow(ROOT_PARENT_ID)}

          <nav
            className="flex max-h-64 flex-col gap-0.5 overflow-y-auto sm:max-h-[calc(100dvh-13rem)] sm:flex-1"
            aria-label="词库分类"
          >
            <Link
              href={categoryHref(null)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                selectedCategory === null
                  ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
              }`}
            >
              <span>全部</span>
              <span className="tabular-nums text-[11px] text-gray-400">{ready ? counts.total : "—"}</span>
            </Link>
            <Link
              href={categoryHref(UNCATEGORIZED_ID)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                selectedCategory === UNCATEGORIZED_ID
                  ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
              }`}
            >
              <span>未分类</span>
              <span className="tabular-nums text-[11px] text-gray-400">
                {ready ? counts.uncategorized : "—"}
              </span>
            </Link>
            {tree.map((node) => renderNode(node, 1))}
          </nav>
          <p className="mt-2 hidden px-1 text-[10px] leading-relaxed text-gray-400 sm:block">
            悬停点「+」可添加子分类（最多 {MAX_CATEGORY_DEPTH} 级）。点选父分类会显示其下全部片段。
          </p>
        </div>
      ) : null}

      <div className="mt-4 border-t border-emerald-100 pt-3 sm:mt-auto dark:border-emerald-900/40">
        <InspirationLinksList variant="sidebar" />
      </div>

      <PromptConfirmDialog
        open={pendingCategoryDelete !== null}
        title={
          pendingCategoryDelete
            ? pendingCategoryDelete.childCount > 0
              ? `删除「${pendingCategoryDelete.name}」及其子分类？`
              : `删除分类「${pendingCategoryDelete.name}」？`
            : "删除分类？"
        }
        description={
          pendingCategoryDelete
            ? pendingCategoryDelete.childCount > 0
              ? `将同时删除 ${pendingCategoryDelete.childCount} 个子分类。相关 ${pendingCategoryDelete.snippetCount} 条片段会移到「未分类」。`
              : `其中 ${pendingCategoryDelete.snippetCount} 条片段会移到「未分类」。分类本身无法恢复。`
            : ""
        }
        confirmLabel="删除分类"
        onCancel={() => setPendingCategoryDelete(null)}
        onConfirm={() => {
          const pending = pendingCategoryDelete;
          if (!pending) return;
          setPendingCategoryDelete(null);
          void removeCategory(pending.id).then(() => {
            if (selectedCategory && pending.subtree.includes(selectedCategory)) {
              router.push(categoryHref(null));
            }
          });
        }}
      />
    </aside>
  );
}
