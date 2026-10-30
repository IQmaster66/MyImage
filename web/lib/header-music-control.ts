/** 顶部栏播放器与桌宠等共用的音乐控制 */

export const MUSIC_TRACK_ID_KEY = "myimage-music-track-id";

export const MUSIC_TRACK_CHANGE_EVENT = "myimage-music-track-change";

export type MusicTrackChangeDetail =
  | { action: "next" }
  | { action: "prev" }
  | { action: "set"; trackId: string }
  | { action: "play" }
  | { action: "pause" }
  | { action: "toggle" };

export function requestMusicTrackChange(detail: MusicTrackChangeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MUSIC_TRACK_CHANGE_EVENT, { detail }));
}

export function subscribeMusicTrackChange(
  cb: (detail: MusicTrackChangeDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<MusicTrackChangeDetail>).detail;
    if (!detail?.action) return;
    cb(detail);
  };
  window.addEventListener(MUSIC_TRACK_CHANGE_EVENT, handler);
  return () => window.removeEventListener(MUSIC_TRACK_CHANGE_EVENT, handler);
}
