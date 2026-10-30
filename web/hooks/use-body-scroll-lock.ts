"use client";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/body-scroll-lock";
import { useEffect } from "react";

/** 打开时锁定页面滚动；关闭或卸载时释放（支持嵌套弹层） */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [locked]);
}
