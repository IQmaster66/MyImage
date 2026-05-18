/** Client-side image helpers for the toolbox (Canvas API). */

export type ExportFormat = "image/png" | "image/jpeg" | "image/webp";

export type NormalizedRect = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

export function revokeUrl(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function loadImageFromUrl(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    const fail = (err: Error) => {
      img.onload = null;
      img.onerror = null;
      cleanup();
      reject(err);
    };
    const ok = () => {
      if (signal?.aborted) return;
      img.onload = null;
      img.onerror = null;
      cleanup();
      resolve(img);
    };
    const onAbort = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = "";
      } catch {
        /* ignore */
      }
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => ok();
    img.onerror = () => fail(new Error("图片加载失败"));
    img.src = url;
  });
}

export function rotateCanvas90(
  source: CanvasImageSource,
  cw: boolean,
): HTMLCanvasElement {
  const w =
    source instanceof HTMLImageElement
      ? source.naturalWidth
      : (source as HTMLCanvasElement).width;
  const h =
    source instanceof HTMLImageElement
      ? source.naturalHeight
      : (source as HTMLCanvasElement).height;

  /** 顺/逆时针 90° 的轴对齐外接矩形都是「原高 × 原宽」，与旋转方向无关 */
  const canvas = document.createElement("canvas");
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((cw ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: ExportFormat,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("导出失败：浏览器不支持该格式或画布为空"));
      },
      mime,
      mime === "image/png" ? undefined : quality,
    );
  });
}

export function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export function cropNormalizedToCanvas(
  source: HTMLImageElement,
  rect: NormalizedRect,
): HTMLCanvasElement {
  const iw = source.naturalWidth;
  const ih = source.naturalHeight;
  const x = Math.round(rect.nx * iw);
  const y = Math.round(rect.ny * ih);
  const w = Math.round(rect.nw * iw);
  const h = Math.round(rect.nh * ih);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  return canvas;
}

export function resizeToMax(
  source: HTMLCanvasElement,
  maxW: number | undefined,
  maxH: number | undefined,
): HTMLCanvasElement {
  let w = source.width;
  let h = source.height;
  if (!maxW && !maxH) {
    const copy = document.createElement("canvas");
    copy.width = w;
    copy.height = h;
    const c = copy.getContext("2d");
    if (!c) throw new Error("无法创建画布上下文");
    c.drawImage(source, 0, 0);
    return copy;
  }

  let tw = w;
  let th = h;
  if (maxW && tw > maxW) {
    th = (maxW / tw) * th;
    tw = maxW;
  }
  if (maxH && th > maxH) {
    tw = (maxH / th) * tw;
    th = maxH;
  }
  tw = Math.max(1, Math.round(tw));
  th = Math.max(1, Math.round(th));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h, 0, 0, tw, th);
  return canvas;
}

export function drawTextWatermark(
  source: HTMLCanvasElement,
  text: string,
  opacity: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.drawImage(source, 0, 0);
  const fontSize = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.028));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.fillStyle = `rgba(255,255,255,${opacity})`;
  ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.35})`;
  ctx.lineWidth = Math.max(1, fontSize / 14);
  const pad = Math.round(fontSize * 0.75);
  const metrics = ctx.measureText(text);
  const tx = canvas.width - metrics.width - pad;
  const ty = canvas.height - pad;
  ctx.strokeText(text, tx, ty);
  ctx.fillText(text, tx, ty);
  return canvas;
}

export function extensionForMime(mime: ExportFormat): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function clampNormalizedRect(r: NormalizedRect): NormalizedRect {
  let nx = Math.min(1, Math.max(0, r.nx));
  let ny = Math.min(1, Math.max(0, r.ny));
  let nw = Math.min(1 - nx, Math.max(0.01, r.nw));
  let nh = Math.min(1 - ny, Math.max(0.01, r.nh));
  return { nx, ny, nw, nh };
}

export function fullImageNormalizedRect(): NormalizedRect {
  return { nx: 0, ny: 0, nw: 1, nh: 1 };
}

// ---- 翻转 / 色彩 / 比例裁剪 / 九宫格 / 圆形头像 ----

export function naturalSize(source: CanvasImageSource): { w: number; h: number } {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight };
  }
  const c = source as HTMLCanvasElement;
  return { w: c.width, h: c.height };
}

export function flipCanvas(
  source: CanvasImageSource,
  horizontal: boolean,
): HTMLCanvasElement {
  const { w, h } = naturalSize(source);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  if (horizontal) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, h);
    ctx.scale(1, -1);
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export type ColorAdjust = {
  brightness: number;
  contrast: number;
  saturate: number;
  /** 色相旋转角度（度） */
  hueRotateDeg: number;
  grayscale: boolean;
};

export const DEFAULT_COLOR_ADJUST: ColorAdjust = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hueRotateDeg: 0,
  grayscale: false,
};

/** 用于 &lt;img style={{ filter }}&gt; 预览 */
export function colorAdjustToCssFilter(c: ColorAdjust): string {
  if (c.grayscale) return "grayscale(1)";
  const parts: string[] = [];
  if (c.brightness !== 1) parts.push(`brightness(${c.brightness})`);
  if (c.contrast !== 1) parts.push(`contrast(${c.contrast})`);
  if (c.saturate !== 1) parts.push(`saturate(${c.saturate})`);
  if (c.hueRotateDeg !== 0) parts.push(`hue-rotate(${c.hueRotateDeg}deg)`);
  return parts.length ? parts.join(" ") : "none";
}

export function applyColorAdjustments(
  source: HTMLCanvasElement,
  adjust: ColorAdjust,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  const f = colorAdjustToCssFilter(adjust);
  if (f !== "none") ctx.filter = f;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  return canvas;
}

/** 在图内居中取目标宽高比（归一化坐标） */
export function centeredAspectNormalizedRect(
  imgW: number,
  imgH: number,
  aspectW: number,
  aspectH: number,
): NormalizedRect {
  const ar = aspectW / aspectH;
  const imgAr = imgW / imgH;
  let cw: number;
  let ch: number;
  if (imgAr > ar) {
    ch = imgH;
    cw = ch * ar;
  } else {
    cw = imgW;
    ch = cw / ar;
  }
  const cx = (imgW - cw) / 2;
  const cy = (imgH - ch) / 2;
  return clampNormalizedRect({
    nx: cx / imgW,
    ny: cy / imgH,
    nw: cw / imgW,
    nh: ch / imgH,
  });
}

/** 将方形居中区域裁成圆形（头像） */
export function applyCircularAvatar(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const size = Math.min(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  const sx = (w - size) / 2;
  const sy = (h - size) / 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(source, sx, sy, size, size, 0, 0, size, size);
  return canvas;
}

/** 圆角矩形裁剪（相对短边的比例） */
export function applyRoundedCorners(
  source: HTMLCanvasElement,
  radiusPx: number,
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const r = Math.min(radiusPx, w / 2, h / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(0, 0, w, h, r);
  } else {
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function splitGrid9(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const w = source.width;
  const h = source.height;
  const cw = Math.floor(w / 3);
  const ch = Math.floor(h / 3);
  const out: HTMLCanvasElement[] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("无法创建画布上下文");
      ctx.drawImage(source, gx * cw, gy * ch, cw, ch, 0, 0, cw, ch);
      out.push(c);
    }
  }
  return out;
}

export type ExportPipelineOptions = {
  crop: NormalizedRect;
  maxW?: number;
  maxH?: number;
  color: ColorAdjust;
  watermarkText: string;
  watermarkOpacity: number;
  format: ExportFormat;
  quality: number;
  /** 导出前裁成圆形头像（在裁剪/缩放之后） */
  circularAvatar?: boolean;
  /** 圆角半径（px），与 circularAvatar 互斥优先圆形 */
  roundedCornerPx?: number;
};

export function buildPipelineCanvas(
  source: HTMLImageElement,
  options: ExportPipelineOptions,
): HTMLCanvasElement {
  let canvas = cropNormalizedToCanvas(source, clampNormalizedRect(options.crop));
  canvas = resizeToMax(canvas, options.maxW, options.maxH);
  canvas = applyColorAdjustments(canvas, options.color);
  if (options.circularAvatar) {
    canvas = applyCircularAvatar(canvas);
  } else if (options.roundedCornerPx && options.roundedCornerPx > 0) {
    canvas = applyRoundedCorners(canvas, options.roundedCornerPx);
  }
  if (options.watermarkText.trim()) {
    canvas = drawTextWatermark(
      canvas,
      options.watermarkText.trim(),
      options.watermarkOpacity,
    );
  }
  return canvas;
}

export async function runImageExportPipeline(
  source: HTMLImageElement,
  options: ExportPipelineOptions,
): Promise<Blob> {
  const canvas = buildPipelineCanvas(source, options);
  return canvasToBlob(
    canvas,
    options.format,
    options.format === "image/png" ? undefined : options.quality,
  );
}

export async function runPipelineFromObjectUrl(
  objectUrl: string,
  options: ExportPipelineOptions,
): Promise<Blob> {
  const img = await loadImageFromUrl(objectUrl);
  return runImageExportPipeline(img, options);
}
