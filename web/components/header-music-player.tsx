"use client";

import { useDialogFocusTrap } from "@/hooks/use-dialog-focus-trap";
import {
  HEADER_MUSIC_TRACKS,
  headerMusicDefaultTrackId,
  headerMusicTrackSrc,
} from "@/lib/header-music-tracks";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LS = {
  volume: "myimage-music-volume",
  loop: "myimage-music-loop",
  muted: "myimage-music-muted",
  spin: "myimage-music-spin",
  trackId: "myimage-music-track-id",
} as const;

function readFloat(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

function readTrackId(): string {
  if (typeof window === "undefined") return headerMusicDefaultTrackId();
  const raw = localStorage.getItem(LS.trackId)?.trim();
  if (raw && HEADER_MUSIC_TRACKS.some((t) => t.id === raw)) return raw;
  return headerMusicDefaultTrackId();
}

export function HeaderMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [spinWhilePlaying, setSpinWhilePlaying] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState(headerMusicDefaultTrackId);

  const [hydrated, setHydrated] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerEntered, setDrawerEntered] = useState(false);
  const drawerOpeningRef = useRef(false);

  const track = useMemo(
    () => HEADER_MUSIC_TRACKS.find((t) => t.id === selectedTrackId) ?? HEADER_MUSIC_TRACKS[0],
    [selectedTrackId],
  );

  const trackSrc = useMemo(() => headerMusicTrackSrc(track.fileName), [track.fileName]);

  useEffect(() => {
    queueMicrotask(() => {
      setVolume(readFloat(LS.volume, 0.8));
      setLoop(readBool(LS.loop, false));
      setMuted(readBool(LS.muted, false));
      setSpinWhilePlaying(readBool(LS.spin, true));
      setSelectedTrackId(readTrackId());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
    el.loop = loop;
  }, [volume, muted, loop]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS.volume, String(volume));
  }, [volume, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS.loop, loop ? "1" : "0");
  }, [loop, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS.muted, muted ? "1" : "0");
  }, [muted, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS.spin, spinWhilePlaying ? "1" : "0");
  }, [spinWhilePlaying, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(LS.trackId, selectedTrackId);
  }, [selectedTrackId, hydrated]);

  /** 切换曲目时从头加载；若正在播则切歌后继续播 */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const wasPlaying = !el.paused;
    el.pause();
    el.currentTime = 0;
    void el.load();
    if (wasPlaying) void el.play().catch(() => {});
  }, [track.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [track.id]);

  const openSettings = useCallback(() => {
    drawerOpeningRef.current = true;
    setShowDrawer(true);
    queueMicrotask(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setDrawerEntered(true));
      });
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerEntered(false);
  }, []);

  useEffect(() => {
    if (drawerEntered) {
      drawerOpeningRef.current = false;
      return;
    }
    if (!showDrawer) return;
    if (drawerOpeningRef.current) return;
    const t = window.setTimeout(() => {
      setShowDrawer(false);
    }, 380);
    return () => window.clearTimeout(t);
  }, [showDrawer, drawerEntered]);

  const onPanelTransitionEnd = useCallback((e: React.TransitionEvent<HTMLElement>) => {
    if (e.propertyName !== "transform") return;
    if (!drawerEntered) {
      setShowDrawer(false);
      setDrawerEntered(false);
    }
  }, [drawerEntered]);

  useDialogFocusTrap(showDrawer && drawerEntered, panelRef, {
    onEscape: closeDrawer,
    lockBodyScroll: true,
  });

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const iconBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-500 dark:focus-visible:ring-offset-gray-900";

  const selectClass =
    "mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/30 focus:outline-none dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100";

  const drawer =
    typeof document !== "undefined" && hydrated && showDrawer ? (
      createPortal(
        <div
          className={`fixed inset-0 z-[200] ${drawerEntered ? "pointer-events-auto" : "pointer-events-none"}`}
          role="presentation"
        >
          <button
            type="button"
            aria-label="关闭设置"
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
              drawerEntered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={closeDrawer}
          />
          <aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-settings-title"
            className={`absolute top-0 right-0 flex h-full max-h-dvh w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-gray-700 dark:bg-zinc-900 ${
              drawerEntered ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
            }`}
            onTransitionEnd={onPanelTransitionEnd}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 id="music-settings-title" className="text-base font-semibold text-gray-900 dark:text-gray-50">
                设置
              </h2>
              <button type="button" onClick={closeDrawer} className={iconBtn} aria-label="关闭">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <section aria-labelledby="music-settings-section">
                <h3 id="music-settings-section" className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  音乐
                </h3>

                <div className="mt-4 space-y-5">
                  <div>
                    <label htmlFor="music-track" className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                      播放歌曲
                    </label>
                    <select
                      id="music-track"
                      value={selectedTrackId}
                      onChange={(e) => setSelectedTrackId(e.target.value)}
                      className={selectClass}
                    >
                      {HEADER_MUSIC_TRACKS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                      更多歌曲：将 mp3 放入 <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800">public/music/</code>
                      ，并在{" "}
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800">lib/header-music-tracks.ts</code>{" "}
                      中登记。
                    </p>
                  </div>

                  <div>
                    <label htmlFor="music-volume" className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">
                      音量
                    </label>
                    <input
                      id="music-volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        if (v > 0) setMuted(false);
                      }}
                      className="w-full cursor-pointer accent-green-600"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {Math.round((muted ? 0 : volume) * 100)}%
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-zinc-800/50">
                    <span className="text-sm text-gray-800 dark:text-gray-200">静音</span>
                    <input
                      type="checkbox"
                      checked={muted}
                      onChange={(e) => setMuted(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-green-600 dark:border-gray-600"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-zinc-800/50">
                    <span className="text-sm text-gray-800 dark:text-gray-200">单曲循环</span>
                    <input
                      type="checkbox"
                      checked={loop}
                      onChange={(e) => setLoop(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-green-600 dark:border-gray-600"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-zinc-800/50">
                    <span className="text-sm text-gray-800 dark:text-gray-200">播放时旋转图标</span>
                    <input
                      type="checkbox"
                      checked={spinWhilePlaying}
                      onChange={(e) => setSpinWhilePlaying(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-green-600 dark:border-gray-600"
                    />
                  </label>
                </div>
              </section>
            </div>
          </aside>
        </div>,
        document.body,
      )
    ) : null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <audio ref={audioRef} src={trackSrc} preload="metadata" loop={loop} className="hidden" />

        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "暂停音乐" : "播放音乐"}
          aria-pressed={playing}
          title={playing ? "暂停" : "播放"}
          className={`${iconBtn} ${
            playing
              ? "bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/35 dark:hover:text-green-300"
              : ""
          }`}
        >
          <svg
            className={`h-5 w-5 shrink-0 ${
              playing && spinWhilePlaying ? "animate-[spin_3.5s_linear_infinite] motion-reduce:animate-none" : ""
            }`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={openSettings}
          aria-label="打开设置"
          title="设置"
          className={iconBtn}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {drawer}
    </>
  );
}
