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

export type DialogFocusTrapOptions = {
  /** 按下 Escape 时调用（例如关闭对话框） */
  onEscape?: () => void;
  /** 为 true 时锁定页面滚动（html + body），并补偿垂直滚动条宽度，避免布局横向跳动 */
  lockBodyScroll?: boolean;
};

function scrollbarGutterPx(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

/**
 * 打开时将焦点移入容器内，Tab 在容器内循环；可选 Escape 与页面滚动锁定（含滚动条占位补偿）；关闭时恢复先前焦点。
 */
export function useDialogFocusTrap(
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options?: DialogFocusTrapOptions,
) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(options?.onEscape);
  onEscapeRef.current = options?.onEscape;
  const lockBodyScroll = options?.lockBodyScroll ?? false;

  useEffect(() => {
    if (!isActive) return;
    const prev = document.activeElement;
    previousFocus.current = prev instanceof HTMLElement ? prev : null;

    const container = containerRef.current;
    if (!container) return;

    let prevHtmlOverflow = "";
    let prevHtmlPaddingRight = "";
    let prevBodyOverflow = "";
    if (lockBodyScroll) {
      const root = document.documentElement;
      prevHtmlOverflow = root.style.overflow;
      prevHtmlPaddingRight = root.style.paddingRight;
      prevBodyOverflow = document.body.style.overflow;
      const gutter = scrollbarGutterPx();
      if (gutter > 0) {
        root.style.paddingRight = `${gutter}px`;
      }
      root.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }

    const focusFirst = () => {
      const list = getFocusable(container);
      (list[0] ?? container).focus();
    };
    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) focusFirst();
      });
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
        container.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onKeyDown, true);
      if (lockBodyScroll) {
        const root = document.documentElement;
        root.style.overflow = prevHtmlOverflow;
        root.style.paddingRight = prevHtmlPaddingRight;
        document.body.style.overflow = prevBodyOverflow;
      }
      const toRestore = previousFocus.current;
      if (toRestore?.isConnected) {
        toRestore.focus();
      }
    };
  }, [isActive, containerRef, lockBodyScroll]);
}
