import { useEffect, useState } from "react";
import { loadImageFromUrl, revokeUrl, runImageExportPipeline, type ExportPipelineOptions } from "@/lib/image-toolbox";

/** 略短于旧版 380ms，仍避免拖拽裁剪时定时器被反复打断 */
const DEBOUNCE_MS = 220;

export function useDebouncedExportPreview(
  previewUrl: string | null,
  getPipelineOptions: () => ExportPipelineOptions,
) {
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  /** 防抖等待或管线计算中；用于缩略图「更新中」提示，减轻「不跟手」感 */
  const [exportPreviewUpdating, setExportPreviewUpdating] = useState(false);

  useEffect(() => {
    return () => {
      if (processedPreviewUrl) revokeUrl(processedPreviewUrl);
    };
  }, [processedPreviewUrl]);

  useEffect(() => {
    if (!previewUrl) {
      setExportPreviewUpdating(false);
      setProcessedPreviewUrl((u) => {
        if (u) revokeUrl(u);
        return null;
      });
      return;
    }

    setExportPreviewUpdating(true);
    const ac = new AbortController();

    const id = window.setTimeout(async () => {
      try {
        if (ac.signal.aborted) return;
        const img = await loadImageFromUrl(previewUrl, ac.signal);
        if (ac.signal.aborted) return;
        const blob = await runImageExportPipeline(img, getPipelineOptions());
        if (ac.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (ac.signal.aborted) {
          revokeUrl(url);
          return;
        }
        setProcessedPreviewUrl((prev) => {
          if (prev) revokeUrl(prev);
          return url;
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          setProcessedPreviewUrl((prev) => {
            if (prev) revokeUrl(prev);
            return null;
          });
        }
      } finally {
        if (!ac.signal.aborted) setExportPreviewUpdating(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(id);
      ac.abort();
      setExportPreviewUpdating(false);
    };
  }, [previewUrl, getPipelineOptions]);

  const clearProcessedPreview = () => {
    setExportPreviewUpdating(false);
    setProcessedPreviewUrl((u) => {
      if (u) revokeUrl(u);
      return null;
    });
  };

  return { processedPreviewUrl, clearProcessedPreview, exportPreviewUpdating };
}
