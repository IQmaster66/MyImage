"use client";

import { HeaderMusicPlayer } from "@/components/header-music-player";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

function subscribeDarkMode(cb: () => void) {
  const root = document.documentElement;
  const mo = new MutationObserver(cb);
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function darkModeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function darkModeServerSnapshot() {
  return false;
}

const NAV_ITEMS = [
  { path: "/recommend", label: "推荐" },
  { path: "/toolbox", label: "工具箱" },
  { path: "/prompts", label: "提示词" },
  { path: "/temp-illustration", label: "临时插画" },
  { path: "/character", label: "人物百科" },
  { path: "/images", label: "后台管理" },
] as const;

function isNavActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showRecentDropdown, setShowRecentDropdown] = useState(false);

  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    darkModeSnapshot,
    darkModeServerSnapshot,
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".recent-dropdown-root")) {
        setShowRecentDropdown(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }, []);

  const recentItems = useMemo<
    { id: string; title: string; thumbnail?: string; viewTime: Date }[]
  >(() => [], []);

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/?search=${encodeURIComponent(q)}`);
    setShowMobileSearch(false);
  }, [router, searchQuery]);

  const onSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch],
  );

  return (
    <header className="relative z-50 shrink-0 border-b border-gray-200 bg-white shadow-md transition-colors dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid h-16 min-h-[4rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-4">
          {/* 左侧：Logo 与品牌名（OrangeImage Header.vue） */}
          <div className="flex min-w-0 items-center justify-self-start">
            <Link
              href="/recommend"
              className="group flex min-w-0 items-center gap-2.5 transition-transform duration-200 hover:scale-[1.02] sm:gap-3"
            >
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-green-400 to-green-600 opacity-0 blur-sm transition-opacity duration-200 group-hover:opacity-50" />
                <Image
                  src="/logo.png"
                  alt="Orange Logo"
                  width={44}
                  height={44}
                  className="relative h-10 w-10 rounded-lg object-contain shadow-sm transition-all duration-200 group-hover:shadow-md sm:h-11 sm:w-11"
                  priority
                />
              </div>
              <span className="truncate bg-gradient-to-r from-green-500 via-green-600 to-green-700 bg-clip-text text-lg leading-none font-bold tracking-tight text-transparent transition-all duration-200 group-hover:from-green-600 group-hover:via-green-700 group-hover:to-green-800 sm:text-xl">
                Orange
              </span>
            </Link>
          </div>

          {/* 中间：导航 */}
          <nav
            className="hidden min-w-0 justify-self-center md:flex md:items-center md:justify-center md:gap-0.5 lg:gap-1"
            aria-label="主要功能导航"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`rounded-lg px-2.5 py-2 text-sm leading-none font-medium tracking-wide whitespace-nowrap transition-all duration-200 lg:px-3.5 ${
                  isNavActive(pathname, item.path)
                    ? "bg-green-50 text-green-600 dark:bg-green-900/20"
                    : "text-gray-700 hover:bg-gray-50 hover:text-green-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 右侧：工具 */}
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 sm:gap-1.5 lg:gap-2">
            <HeaderMusicPlayer />

            <div className="recent-dropdown-root relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRecentDropdown((v) => !v);
                }}
                aria-expanded={showRecentDropdown}
                aria-haspopup="true"
                aria-label="最近观看"
                className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-500"
                title="最近观看"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {recentItems.length > 0 ? (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" />
                ) : null}
              </button>

              {showRecentDropdown ? (
                <div
                  className="absolute top-full left-2 z-50 mt-3 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <div className="flex items-center justify-between bg-gradient-to-r from-green-500 to-green-600 px-4 py-3">
                    <h3 className="text-sm font-semibold text-white">
                      最近观看
                    </h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <div className="p-8 text-center">
                      <svg
                        className="mx-auto mb-3 h-12 w-12 text-gray-400 dark:text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        暂无最近观看记录
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-500"
              title={isDark ? "切换到浅色模式" : "切换到深色模式"}
              aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
            >
              {!isDark ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              )}
            </button>

            <div className="relative hidden lg:block">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                type="search"
                placeholder="搜索图片..."
                aria-label="搜索图片"
                className="h-9 w-52 min-w-0 rounded-full border border-gray-300 bg-white py-0 pr-3 pl-9 text-sm text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:ring-2 focus:ring-green-500 focus:outline-none xl:w-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                onKeyDown={onSearchKeyDown}
              />
              <svg
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => setShowMobileSearch((v) => !v)}
              aria-expanded={showMobileSearch}
              aria-label="搜索图片"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600 lg:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-500"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowMobileMenu((v) => !v)}
              aria-expanded={showMobileMenu}
              aria-controls="mobile-main-nav"
              aria-label={showMobileMenu ? "关闭导航菜单" : "打开导航菜单"}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600 md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-500"
            >
              {!showMobileMenu ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {showMobileSearch ? (
          <div className="pb-4 lg:hidden">
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                type="search"
                placeholder="搜索图片..."
                aria-label="搜索图片"
                className="w-full rounded-full border border-gray-300 bg-white py-2 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-green-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                onKeyDown={onSearchKeyDown}
              />
              <svg
                className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        ) : null}

        {showMobileMenu ? (
          <div
            id="mobile-main-nav"
            className="mt-2 border-t border-gray-200 pt-4 pb-4 md:hidden dark:border-gray-800"
          >
            <nav className="flex flex-col space-y-2" aria-label="主要功能导航">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    isNavActive(pathname, item.path)
                      ? "bg-green-50 text-green-600 dark:bg-green-900/20"
                      : "text-gray-700 hover:bg-gray-50 hover:text-green-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
                  }`}
                  onClick={() => setShowMobileMenu(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
