export const THEME_COOKIE = "theme";
export const THEME_STORAGE_KEY = "theme";

/** 写入 cookie，供下次 SSR 读主题，避免依赖内联 script */
export function writeThemeCookie(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
}

export function applyTheme(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
  const theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  writeThemeCookie(theme);
}

export function resolvePreferredDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
