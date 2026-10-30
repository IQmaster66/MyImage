"use client";

import { requestMusicTrackChange } from "@/lib/header-music-control";
import {
  isSpeechRecognitionSupported,
  MASCOT_VOICE_HINT,
  startVoiceListen,
} from "@/lib/mascot-voice";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type TalkPhase = "ask" | "listening" | "done";

const POS_KEY = "myimage-mascot-pos";
const HIDDEN_KEY = "myimage-mascot-hidden";
const SCALE_KEY = "myimage-mascot-scale";
const SCALES = [0.8, 1, 1.25, 1.5] as const;
/** 原图 480×720 */
const ASPECT = 720 / 480;
const PAD = 12;
/** 与 SiteHeader 的 h-16 对齐，避免贴顶时压住导航 */
const HEADER_H = 64;

type Pos = { x: number; y: number };
type Menu = { x: number; y: number };
type BubblePlace = "above" | "left" | "right";

const BUBBLE_W = 220;
const BUBBLE_GAP = 10;
const BUBBLE_EST_H = 118;

function edgePad(): number {
  return typeof window !== "undefined" && window.innerWidth < 640 ? 4 : PAD;
}

function topInset(): number {
  return HEADER_H + edgePad();
}

/** 气泡优先在桌宠上方，空间不够再贴左/右，并保证不超出视口 */
function bubbleLayout(
  mascot: Pos,
  size: { w: number; h: number },
): { left: number; top: number; place: BubblePlace } {
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const topMin = topInset();
  const cx = mascot.x + size.w / 2;

  const aboveTop = mascot.y - BUBBLE_EST_H - BUBBLE_GAP;
  if (aboveTop >= topMin) {
    return {
      left: Math.min(Math.max(pad, cx - BUBBLE_W / 2), vw - BUBBLE_W - pad),
      top: aboveTop,
      place: "above",
    };
  }

  const preferLeft = cx > vw * 0.55;
  if (preferLeft) {
    return {
      left: Math.max(pad, mascot.x - BUBBLE_W - BUBBLE_GAP),
      top: Math.min(
        Math.max(topMin, mascot.y + size.h * 0.12),
        vh - BUBBLE_EST_H - pad,
      ),
      place: "left",
    };
  }
  return {
    left: Math.min(mascot.x + size.w + BUBBLE_GAP, vw - BUBBLE_W - pad),
    top: Math.min(
      Math.max(topMin, mascot.y + size.h * 0.12),
      vh - BUBBLE_EST_H - pad,
    ),
    place: "right",
  };
}

function baseWidth(): number {
  if (typeof window === "undefined") return 128;
  return window.innerWidth < 640 ? 96 : 128;
}

function boxSize(scale: number): { w: number; h: number } {
  const w = Math.round(baseWidth() * scale);
  return { w, h: Math.round(w * ASPECT) };
}

function clampPos(pos: Pos, scale: number): Pos {
  const { w, h } = boxSize(scale);
  const pad = edgePad();
  const top = topInset();
  return {
    x: Math.min(Math.max(pad, window.innerWidth - w - pad), Math.max(pad, pos.x)),
    y: Math.min(Math.max(top, window.innerHeight - h - pad), Math.max(top, pos.y)),
  };
}

function defaultPos(scale: number): Pos {
  const { w, h } = boxSize(scale);
  const pad = edgePad();
  return clampPos(
    { x: window.innerWidth - w - pad, y: window.innerHeight - h - pad },
    scale,
  );
}

function snapToEdge(pos: Pos, scale: number): Pos {
  const { w, h } = boxSize(scale);
  const pad = edgePad();
  const top = topInset();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const distLeft = pos.x - pad;
  const distRight = vw - (pos.x + w) - pad;
  const distTop = pos.y - top;
  const distBottom = vh - (pos.y + h) - pad;
  const nearest = Math.min(distLeft, distRight, distTop, distBottom);
  const y = Math.min(Math.max(top, pos.y), Math.max(top, vh - h - pad));
  const x = Math.min(Math.max(pad, pos.x), Math.max(pad, vw - w - pad));
  if (nearest === distLeft) return { x: pad, y };
  if (nearest === distRight) return { x: Math.max(pad, vw - w - pad), y };
  if (nearest === distTop) return { x, y: top };
  return { x, y: Math.max(pad, vh - h - pad) };
}

function readScale(): number {
  const n = Number(localStorage.getItem(SCALE_KEY));
  return (SCALES as readonly number[]).includes(n) ? n : 1;
}

function readSavedPos(scale: number): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Pos>;
      if (typeof o.x === "number" && typeof o.y === "number") {
        return clampPos({ x: o.x, y: o.y }, scale);
      }
    }
  } catch {
    /* ignore */
  }
  return defaultPos(scale);
}

function savePos(pos: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

/** 全站可拖拽桌宠：贴边、右键菜单、点击会跳一下 */
export function CornerMascot() {
  const src = "/gif/fubuki-mascot.webp";
  const [pos, setPos] = useState<Pos | null>(null);
  const [scale, setScale] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [talkPhase, setTalkPhase] = useState<TalkPhase | null>(null);
  const [talkMessage, setTalkMessage] = useState("");
  const dragRef = useRef<{
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const nextScale = readScale();
    setScale(nextScale);
    setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    setPos(readSavedPos(nextScale));
    setReady(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        const s = readScale();
        return prev ? clampPos(prev, s) : defaultPos(s);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const playHop = useCallback(() => {
    setHopping(false);
    requestAnimationFrame(() => setHopping(true));
    if (hopTimer.current) clearTimeout(hopTimer.current);
    hopTimer.current = setTimeout(() => setHopping(false), 650);
  }, []);

  const closeTalk = useCallback(() => {
    stopListenRef.current?.();
    stopListenRef.current = null;
    if (talkDoneTimer.current) {
      clearTimeout(talkDoneTimer.current);
      talkDoneTimer.current = null;
    }
    setTalkPhase(null);
    setTalkMessage("");
  }, []);

  const showTalkDone = useCallback(
    (message: string, ms = 2800) => {
      setTalkPhase("done");
      setTalkMessage(message);
      if (talkDoneTimer.current) clearTimeout(talkDoneTimer.current);
      talkDoneTimer.current = setTimeout(() => {
        setTalkPhase(null);
        setTalkMessage("");
        talkDoneTimer.current = null;
      }, ms);
    },
    [],
  );

  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      showTalkDone("当前浏览器不支持语音识别，请用 Chrome / Edge", 3600);
      return;
    }
    setTalkPhase("listening");
    setTalkMessage("正在申请麦克风…");
    stopListenRef.current?.();
    stopListenRef.current = startVoiceListen({
      timeoutMs: 12000,
      onStatus: (text) => {
        setTalkPhase("listening");
        setTalkMessage(text);
      },
      onResult: (result) => {
        stopListenRef.current = null;
        if (!result.ok) {
          if (result.reason === "aborted") {
            closeTalk();
            return;
          }
          showTalkDone(result.message || "没听清，再点我试一次", 4200);
          return;
        }
        if (result.matched) {
          requestMusicTrackChange({ action: "play" });
          playHop();
          showTalkDone("好的，开始播放～");
          return;
        }
        showTalkDone(
          result.transcript
            ? `听到了「${result.transcript}」，请说「${MASCOT_VOICE_HINT}」`
            : `没听清，请说「${MASCOT_VOICE_HINT}」`,
          4200,
        );
      },
    });
  }, [closeTalk, playHop, showTalkDone]);

  useEffect(() => {
    if (!talkPhase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTalk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [talkPhase, closeTalk]);

  useEffect(() => {
    return () => {
      if (hopTimer.current) clearTimeout(hopTimer.current);
      if (talkDoneTimer.current) clearTimeout(talkDoneTimer.current);
      stopListenRef.current?.();
    };
  }, []);

  const applyPos = useCallback((next: Pos) => {
    setPos(next);
    savePos(next);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;
    setMenu(null);
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
        drag.moved = true;
      }
      const next = clampPos(
        { x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY },
        scale,
      );
      setPos(next);
    },
    [scale],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!drag.moved) {
        playHop();
        setMenu(null);
        stopListenRef.current?.();
        stopListenRef.current = null;
        if (talkDoneTimer.current) {
          clearTimeout(talkDoneTimer.current);
          talkDoneTimer.current = null;
        }
        setTalkPhase("ask");
        setTalkMessage("需要对话吗？");
        return;
      }
      setPos((prev) => {
        if (!prev) return prev;
        const snapped = snapToEdge(prev, scale);
        savePos(snapped);
        return snapped;
      });
    },
    [playHop, scale],
  );

  const changeScale = (dir: 1 | -1) => {
    const idx = SCALES.indexOf(scale as (typeof SCALES)[number]);
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, idx + dir))] ?? scale;
    setScale(next);
    localStorage.setItem(SCALE_KEY, String(next));
    setPos((prev) => {
      const base = prev ?? defaultPos(next);
      const snapped = snapToEdge(clampPos(base, next), next);
      savePos(snapped);
      return snapped;
    });
    setMenu(null);
  };

  const resetPos = () => {
    const next = defaultPos(scale);
    applyPos(next);
    setMenu(null);
  };

  const hide = () => {
    setHidden(true);
    localStorage.setItem(HIDDEN_KEY, "1");
    setMenu(null);
  };

  const show = () => {
    setHidden(false);
    localStorage.setItem(HIDDEN_KEY, "0");
    setPos((prev) => prev ?? defaultPos(scale));
  };

  if (!ready || !pos) return null;

  const size = boxSize(scale);
  const { w } = size;
  const bubble = talkPhase ? bubbleLayout(pos, size) : null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={show}
        className="fixed right-3 bottom-3 z-[55] rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-md hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900/95 dark:text-emerald-200"
      >
        显示桌宠
      </button>
    );
  }

  return (
    <>
      <img
        src={src}
        alt=""
        draggable={false}
        title="单击对话 · 拖拽移动 · 右键更多"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(e) => {
          e.preventDefault();
          const menuW = 148;
          const menuH = 220;
          setMenu({
            x: Math.min(e.clientX, window.innerWidth - menuW - 8),
            y: Math.min(e.clientY, window.innerHeight - menuH - 8),
          });
        }}
        style={{
          left: pos.x,
          top: pos.y,
          width: w,
          animation: hopping ? "mascot-hop 0.65s ease" : undefined,
        }}
        className={`fixed z-[55] h-auto touch-none select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      />
      {talkPhase && bubble ? (
        <div
          role="dialog"
          aria-label="桌宠对话"
          className="mascot-talk-bubble fixed z-[56]"
          style={{ left: bubble.left, top: bubble.top, width: BUBBLE_W }}
          data-place={bubble.place}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative overflow-hidden rounded-[1.15rem] border border-emerald-200/80 bg-white/95 px-3.5 py-3 shadow-[0_12px_28px_-8px_rgba(16,185,129,0.35),0_4px_12px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-emerald-800/50 dark:bg-zinc-900/95 dark:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.55)]">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500"
              aria-hidden
            />
            <p className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">
              {talkMessage}
            </p>
            {talkPhase === "ask" ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
                  onClick={startListening}
                >
                  好啊
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-full border border-gray-200/90 bg-gray-50/80 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-gray-300 dark:hover:bg-zinc-800"
                  onClick={closeTalk}
                >
                  不用了
                </button>
              </div>
            ) : null}
            {talkPhase === "listening" ? (
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="mascot-talk-pulse inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                聆听中
              </div>
            ) : null}
            {talkPhase === "done" ? (
              <button
                type="button"
                className="mt-2.5 text-[11px] text-gray-400 transition hover:text-emerald-600 dark:hover:text-emerald-400"
                onClick={closeTalk}
              >
                关闭
              </button>
            ) : null}
          </div>
          <span className="mascot-talk-tail" aria-hidden />
        </div>
      ) : null}
      {menu ? (
        <div
          role="menu"
          className="fixed z-[56] w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={resetPos} className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 dark:text-gray-100 dark:hover:bg-zinc-800">
            回到右下角
          </button>
          <button type="button" role="menuitem" onClick={() => changeScale(1)} disabled={scale >= SCALES[SCALES.length - 1]} className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 disabled:opacity-40 dark:text-gray-100 dark:hover:bg-zinc-800">
            放大
          </button>
          <button type="button" role="menuitem" onClick={() => changeScale(-1)} disabled={scale <= SCALES[0]} className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 disabled:opacity-40 dark:text-gray-100 dark:hover:bg-zinc-800">
            缩小
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-zinc-700" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              requestMusicTrackChange({ action: "prev" });
              setMenu(null);
              playHop();
            }}
            className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            上一首
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              requestMusicTrackChange({ action: "next" });
              setMenu(null);
              playHop();
            }}
            className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            下一首
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-zinc-700" role="separator" />
          <button type="button" role="menuitem" onClick={hide} className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-emerald-50 dark:text-gray-100 dark:hover:bg-zinc-800">
            隐藏
          </button>
        </div>
      ) : null}
    </>
  );
}
