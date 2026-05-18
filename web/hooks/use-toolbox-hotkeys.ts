import { useEffect } from "react";

export function useToolboxHotkeys(options: {
  /** 为 true 时不响应快捷键（例如导出预览灯箱打开时，避免误触导出/旋转） */
  suspended?: boolean;
  onExport: () => void | Promise<void>;
  onRotateCw: () => void | Promise<void>;
  onResetCrop: () => void;
}) {
  const { suspended = false, onExport, onRotateCw, onResetCrop } = options;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (suspended) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          void onExport();
        }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        void onExport();
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void onRotateCw();
      }
      if (e.key === "0") {
        e.preventDefault();
        onResetCrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suspended, onExport, onRotateCw, onResetCrop]);
}
