import { lockBodyScroll, unlockBodyScroll } from "@/lib/body-scroll-lock";
import { useEffect, useRef, type RefObject } from "react";

function focusableSelector() {
  return [
    "a[href]:not([tabindex='-1'])",
    "button:not([disabled]):not([tabindex='-1'])",
    "input:not([disabled]):not([tabindex='-1'])",
    "select:not([disabled]):not([tabindex='-1'])",
    "textarea:not([disabled]):not([tabindex='-1'])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector())).filter((el) => {
    const st = window.getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") return false;
    return el.getClientRects().length > 0;
  });
}

function focusEl(el: HTMLElement) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

export type DialogFocusTrapOptions = {
  /** 按下 Escape 时调用（例如关闭对话框） */
  onEscape?: () => void;
  /** 为 true 时锁定页面滚动（引用计数，可与其它弹层叠加） */
  lockBodyScroll?: boolean;
};

/**
 * 打开时将焦点移入容器内，Tab 在容器内循环；可选 Escape 与页面滚动锁定；关闭时恢复先前焦点。
 */
export function useDialogFocusTrap(
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options?: DialogFocusTrapOptions,
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(options?.onEscape);
  onEscapeRef.current = options?.onEscape;
  const shouldLockScroll = options?.lockBodyScroll ?? false;

  useEffect(() => {
    if (!isActive) return;
    const prev = document.activeElement;
    previousFocus.current = prev instanceof HTMLElement ? prev : null;

    const container = containerRef.current;
    if (!container) return;

    if (shouldLockScroll) lockBodyScroll();

    const focusFirst = () => {
      const list = getFocusable(container);
      focusEl(list[0] ?? container);
    };
    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (!cancelled) focusFirst();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const list = getFocusable(container);
      if (list.length === 0) {
        e.preventDefault();
        focusEl(container);
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          focusEl(last);
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          focusEl(first);
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onKeyDown, true);
      if (shouldLockScroll) unlockBodyScroll();
      const toRestore = previousFocus.current;
      if (toRestore?.isConnected) {
        focusEl(toRestore);
      }
    };
  }, [isActive, containerRef, shouldLockScroll]);
}
