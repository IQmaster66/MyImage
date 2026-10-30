import { useEffect, useState } from "react";

/** 仅管理灯箱开关；打开时的 Escape / 焦点陷阱 / body 滚动由 `ExportPreviewLightbox` 统一处理 */
export function useExportPreviewLightbox(processedPreviewUrl: string | null) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!processedPreviewUrl) setOpen(false);
  }, [processedPreviewUrl]);

  return { exportPreviewLightboxOpen: open, setExportPreviewLightboxOpen: setOpen };
}
