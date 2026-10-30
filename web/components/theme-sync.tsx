"use client";

import { applyTheme, resolvePreferredDark } from "@/lib/theme";
import { useEffect } from "react";

/** 无 cookie 时用本机偏好补齐；并与 localStorage 同步 cookie，供下次 SSR */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(resolvePreferredDark());
  }, []);
  return null;
}
