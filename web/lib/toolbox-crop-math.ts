import { clampNormalizedRect, type NormalizedRect } from "@/lib/image-toolbox";

export type ImgContentLayout = { ox: number; oy: number; dw: number; dh: number };

export function imageContentMetrics(img: HTMLImageElement) {
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || !cw || !ch) {
    return { ox: 0, oy: 0, dw: cw, dh: ch, nw: nw || 1, nh: nh || 1 };
  }
  const scale = Math.min(cw / nw, ch / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return { ox, oy, dw, dh, nw, nh };
}

export function clientToNormalized(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
): { nx: number; ny: number } {
  const r = img.getBoundingClientRect();
  const lx = clientX - r.left;
  const ly = clientY - r.top;
  const { ox, oy, dw, dh } = imageContentMetrics(img);
  const nx = (lx - ox) / dw;
  const ny = (ly - oy) / dh;
  return {
    nx: Math.min(1, Math.max(0, nx)),
    ny: Math.min(1, Math.max(0, ny)),
  };
}

export function rectFromCorners(
  a: { nx: number; ny: number },
  b: { nx: number; ny: number },
): NormalizedRect {
  const nx = Math.min(a.nx, b.nx);
  const ny = Math.min(a.ny, b.ny);
  const nw = Math.abs(a.nx - b.nx);
  const nh = Math.abs(a.ny - b.ny);
  return clampNormalizedRect({
    nx,
    ny,
    nw: Math.max(nw, 0.02),
    nh: Math.max(nh, 0.02),
  });
}

export function isEffectivelyFullRect(r: NormalizedRect): boolean {
  const rr = clampNormalizedRect(r);
  return rr.nx <= 0.002 && rr.ny <= 0.002 && rr.nw >= 0.998 && rr.nh >= 0.998;
}

export function isNormPointInRect(nx: number, ny: number, r: NormalizedRect): boolean {
  const rr = clampNormalizedRect(r);
  const eps = 1e-4;
  return (
    nx >= rr.nx - eps &&
    nx <= rr.nx + rr.nw + eps &&
    ny >= rr.ny - eps &&
    ny <= rr.ny + rr.nh + eps
  );
}

export function clampCropTranslate(r: NormalizedRect): NormalizedRect {
  const rr = clampNormalizedRect(r);
  const nx = Math.min(1 - rr.nw, Math.max(0, rr.nx));
  const ny = Math.min(1 - rr.nh, Math.max(0, rr.ny));
  return { nx, ny, nw: rr.nw, nh: rr.nh };
}

export type CropResizeEdge = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const CROP_EDGE_HIT_PX = 10;

export function hitCropHandle(
  clientX: number,
  clientY: number,
  img: HTMLImageElement,
  layout: ImgContentLayout,
  r: NormalizedRect,
): CropResizeEdge | null {
  const rr = clampNormalizedRect(r);
  const imgRect = img.getBoundingClientRect();
  const lx = clientX - imgRect.left - layout.ox;
  const ly = clientY - imgRect.top - layout.oy;
  const cl = rr.nx * layout.dw;
  const ct = rr.ny * layout.dh;
  const cw = rr.nw * layout.dw;
  const ch = rr.nh * layout.dh;
  const cr = cl + cw;
  const cb = ct + ch;
  const tol = Math.min(CROP_EDGE_HIT_PX, Math.max(5, Math.min(layout.dw, layout.dh) * 0.02));

  const nearL = Math.abs(lx - cl) <= tol;
  const nearR = Math.abs(lx - cr) <= tol;
  const nearT = Math.abs(ly - ct) <= tol;
  const nearB = Math.abs(ly - cb) <= tol;
  const inH = ly >= ct - tol && ly <= cb + tol;
  const inV = lx >= cl - tol && lx <= cr + tol;

  if (nearT && nearL && inH && inV) return "nw";
  if (nearT && nearR && inH && inV) return "ne";
  if (nearB && nearL && inH && inV) return "sw";
  if (nearB && nearR && inH && inV) return "se";
  if (nearT && inV) return "n";
  if (nearB && inV) return "s";
  if (nearL && inH) return "w";
  if (nearR && inH) return "e";
  return null;
}

const CROP_MIN = 0.02;

export function applyCropResize(
  edge: CropResizeEdge,
  orig: NormalizedRect,
  cur: { nx: number; ny: number },
): NormalizedRect {
  const o = clampNormalizedRect(orig);
  const cx = cur.nx;
  const cy = cur.ny;
  switch (edge) {
    case "e":
      return clampNormalizedRect({
        nx: o.nx,
        ny: o.ny,
        nw: Math.max(CROP_MIN, Math.min(1 - o.nx, cx) - o.nx),
        nh: o.nh,
      });
    case "w": {
      const left = Math.max(0, Math.min(o.nx + o.nw - CROP_MIN, cx));
      return clampNormalizedRect({
        nx: left,
        ny: o.ny,
        nw: o.nx + o.nw - left,
        nh: o.nh,
      });
    }
    case "s":
      return clampNormalizedRect({
        nx: o.nx,
        ny: o.ny,
        nw: o.nw,
        nh: Math.max(CROP_MIN, Math.min(1 - o.ny, cy) - o.ny),
      });
    case "n": {
      const top = Math.max(0, Math.min(o.ny + o.nh - CROP_MIN, cy));
      return clampNormalizedRect({
        nx: o.nx,
        ny: top,
        nw: o.nw,
        nh: o.ny + o.nh - top,
      });
    }
    case "se":
      return rectFromCorners({ nx: o.nx, ny: o.ny }, { nx: cx, ny: cy });
    case "nw":
      return rectFromCorners({ nx: o.nx + o.nw, ny: o.ny + o.nh }, { nx: cx, ny: cy });
    case "ne":
      return rectFromCorners({ nx: o.nx, ny: o.ny + o.nh }, { nx: cx, ny: cy });
    case "sw":
      return rectFromCorners({ nx: o.nx + o.nw, ny: o.ny }, { nx: cx, ny: cy });
    default:
      return o;
  }
}

export function cursorForResizeEdge(edge: CropResizeEdge): string {
  switch (edge) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    default:
      return "crosshair";
  }
}
