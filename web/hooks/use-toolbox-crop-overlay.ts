import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  applyCropResize,
  clampCropTranslate,
  clientToNormalized,
  cursorForResizeEdge,
  hitCropHandle,
  imageContentMetrics,
  isEffectivelyFullRect,
  isNormPointInRect,
  rectFromCorners,
  type CropResizeEdge,
  type ImgContentLayout,
} from "@/lib/toolbox-crop-math";
import {
  clampNormalizedRect,
  fullImageNormalizedRect as fullRect,
  type NormalizedRect,
} from "@/lib/image-toolbox";

type DragCorner = { a: { nx: number; ny: number }; b: { nx: number; ny: number } };

export function useToolboxCropOverlay(options: {
  imgRef: RefObject<HTMLImageElement | null>;
  cropEnabled: boolean;
  previewUrl: string | null;
}) {
  const { imgRef, cropEnabled, previewUrl } = options;

  const [cropRect, setCropRect] = useState<NormalizedRect>(() => fullRect());
  const [dragCorner, setDragCorner] = useState<DragCorner | null>(null);
  const [cropDragMove, setCropDragMove] = useState<{
    startNorm: { nx: number; ny: number };
    origRect: NormalizedRect;
  } | null>(null);
  const [cropResize, setCropResize] = useState<{
    edge: CropResizeEdge;
    origRect: NormalizedRect;
  } | null>(null);
  const [cropHoverCursor, setCropHoverCursor] = useState("crosshair");
  const [imgLayout, setImgLayout] = useState<ImgContentLayout | null>(null);

  const measureImg = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) {
      setImgLayout(null);
      return;
    }
    const m = imageContentMetrics(img);
    setImgLayout({ ox: m.ox, oy: m.oy, dw: m.dw, dh: m.dh });
  }, [imgRef]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !previewUrl) return;
    const ro = new ResizeObserver(() => measureImg());
    ro.observe(img);
    return () => ro.disconnect();
  }, [previewUrl, measureImg, imgRef]);

  const resetCrop = useCallback(() => {
    setCropRect(fullRect());
    setDragCorner(null);
    setCropDragMove(null);
    setCropResize(null);
    setCropHoverCursor("crosshair");
  }, []);

  const cropHoleStyle = useMemo(() => {
    const r = clampNormalizedRect(cropRect);
    if (!imgLayout) {
      return { display: "none" } as const;
    }
    return {
      left: imgLayout.ox + r.nx * imgLayout.dw,
      top: imgLayout.oy + r.ny * imgLayout.dh,
      width: Math.max(1, r.nw * imgLayout.dw),
      height: Math.max(1, r.nh * imgLayout.dh),
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)",
    };
  }, [cropRect, imgLayout]);

  const onCropMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!cropEnabled) return;
      const img = imgRef.current;
      if (!img || !img.naturalWidth) return;
      e.preventDefault();
      const r = clampNormalizedRect(cropRect);
      if (imgLayout) {
        const handle = hitCropHandle(e.clientX, e.clientY, img, imgLayout, r);
        if (handle) {
          setCropResize({ edge: handle, origRect: r });
          return;
        }
      }
      const a = clientToNormalized(img, e.clientX, e.clientY);
      if (!isEffectivelyFullRect(r) && isNormPointInRect(a.nx, a.ny, r)) {
        setCropDragMove({ startNorm: a, origRect: r });
        return;
      }
      setDragCorner({ a, b: a });
    },
    [cropEnabled, imgRef, cropRect, imgLayout],
  );

  const onCropMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (cropResize || cropDragMove || dragCorner) return;
      const img = imgRef.current;
      if (!img || !imgLayout) {
        setCropHoverCursor("crosshair");
        return;
      }
      const r = clampNormalizedRect(cropRect);
      const handle = hitCropHandle(e.clientX, e.clientY, img, imgLayout, r);
      if (handle) {
        setCropHoverCursor(cursorForResizeEdge(handle));
        return;
      }
      const a = clientToNormalized(img, e.clientX, e.clientY);
      if (!isEffectivelyFullRect(r) && isNormPointInRect(a.nx, a.ny, r)) {
        setCropHoverCursor("grab");
        return;
      }
      setCropHoverCursor("crosshair");
    },
    [imgLayout, cropRect, cropResize, cropDragMove, dragCorner, imgRef],
  );

  const onCropMouseLeave = useCallback(() => {
    if (!cropResize && !cropDragMove && !dragCorner) setCropHoverCursor("crosshair");
  }, [cropResize, cropDragMove, dragCorner]);

  const cropOverlayCursor = useMemo(() => {
    if (cropResize) return cursorForResizeEdge(cropResize.edge);
    if (cropDragMove) return "grabbing";
    if (dragCorner) return "crosshair";
    return cropHoverCursor;
  }, [cropResize, cropDragMove, dragCorner, cropHoverCursor]);

  useEffect(() => {
    if (cropResize) {
      document.body.style.cursor = cursorForResizeEdge(cropResize.edge);
      return () => {
        document.body.style.cursor = "";
      };
    }
    if (cropDragMove) {
      document.body.style.cursor = "grabbing";
      return () => {
        document.body.style.cursor = "";
      };
    }
    if (dragCorner) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "";
      };
    }
    return;
  }, [cropResize, cropDragMove, dragCorner]);

  useEffect(() => {
    if (!dragCorner) return;

    const onMove = (e: MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const b = clientToNormalized(img, e.clientX, e.clientY);
      setCropRect(rectFromCorners(dragCorner.a, b));
    };

    const onUp = () => {
      setDragCorner(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragCorner, imgRef]);

  useEffect(() => {
    if (!cropDragMove) return;

    const onMove = (e: MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const cur = clientToNormalized(img, e.clientX, e.clientY);
      const dnx = cur.nx - cropDragMove.startNorm.nx;
      const dny = cur.ny - cropDragMove.startNorm.ny;
      setCropRect(
        clampCropTranslate({
          nx: cropDragMove.origRect.nx + dnx,
          ny: cropDragMove.origRect.ny + dny,
          nw: cropDragMove.origRect.nw,
          nh: cropDragMove.origRect.nh,
        }),
      );
    };

    const onUp = () => {
      setCropDragMove(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [cropDragMove, imgRef]);

  useEffect(() => {
    if (!cropResize) return;

    const onMove = (e: MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const cur = clientToNormalized(img, e.clientX, e.clientY);
      setCropRect(applyCropResize(cropResize.edge, cropResize.origRect, cur));
    };

    const onUp = () => {
      setCropResize(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [cropResize, imgRef]);

  return {
    cropRect,
    setCropRect,
    resetCrop,
    measureImg,
    cropHoleStyle,
    cropOverlayCursor,
    onCropMouseDown,
    onCropMouseMove,
    onCropMouseLeave,
  };
}
