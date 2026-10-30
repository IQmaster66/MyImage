"use client";

import type { ReactNode } from "react";

/** 各主功能页共用背景与最小高度，避免路由切换时背景闪变与高度塌陷 */
const SHELL_CLASS =
  "min-h-[calc(100dvh-4rem)] bg-gradient-to-b from-emerald-50/80 via-white/90 to-zinc-50/90 dark:from-emerald-950/35 dark:via-zinc-950/80 dark:to-zinc-950";

export function MainContentShell({ children }: { children: ReactNode }) {
  return <div className={SHELL_CLASS}>{children}</div>;
}
