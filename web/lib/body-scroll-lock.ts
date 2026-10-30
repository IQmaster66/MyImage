/**
 * 页面滚动锁定（带引用计数，支持弹框叠放大图）。
 * 已设 `scrollbar-gutter: stable` 时不再叠加 padding，避免横向抖动。
 */

let lockCount = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";
let savedHtmlPaddingRight = "";
let savedPadApplied = false;

function measureScrollbarWidth(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function hasStableScrollbarGutter(): boolean {
  try {
    const g = getComputedStyle(document.documentElement).scrollbarGutter;
    return g === "stable" || g.startsWith("stable");
  } catch {
    return false;
  }
}

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return;

  const root = document.documentElement;
  savedHtmlOverflow = root.style.overflow;
  savedBodyOverflow = document.body.style.overflow;
  savedHtmlPaddingRight = root.style.paddingRight;

  // stable gutter 已预留滚动条宽度，再加 padding 会造成二次偏移抖动
  const gutter = hasStableScrollbarGutter() ? 0 : measureScrollbarWidth();
  savedPadApplied = gutter > 0;
  if (savedPadApplied) {
    root.style.paddingRight = `${gutter}px`;
    root.style.setProperty("--scroll-lock-pad", `${gutter}px`);
  }

  root.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const root = document.documentElement;
  root.style.overflow = savedHtmlOverflow;
  document.body.style.overflow = savedBodyOverflow;
  if (savedPadApplied) {
    root.style.paddingRight = savedHtmlPaddingRight;
    root.style.removeProperty("--scroll-lock-pad");
  }
  savedPadApplied = false;
}
