"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/prompts", label: "工作台", description: "编写与预览" },
  { href: "/prompts/categories", label: "分类词库", description: "按主题整理" },
  { href: "/prompts/favorites", label: "收藏", description: "常用片段" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/prompts") return pathname === "/prompts";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PromptsSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-b border-emerald-200/90 bg-white/95 p-3 shadow-sm sm:w-56 sm:border-r sm:border-b-0 sm:shadow-none dark:border-emerald-900/50 dark:bg-zinc-900/95"
      aria-label="提示词导航"
    >
      <div className="mb-3 border-b border-emerald-100 px-1 pb-3 dark:border-emerald-900/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          提示词
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">本地整理与复用</p>
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
    </aside>
  );
}
