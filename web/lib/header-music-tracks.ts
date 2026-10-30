export type HeaderMusicTrack = {
  /** 稳定键，写入 localStorage（默认用文件名） */
  id: string;
  /** 列表与设置中展示的名称 */
  title: string;
  /** 相对 `public/music/` 的文件名（可含空格、逗号等） */
  fileName: string;
};

const AUDIO_EXT = /\.(mp3|m4a|ogg|wav|flac|webm)$/i;

/**
 * 可选：仅当文件名展示不友好时再登记。
 * 平时只需把音频放进 `public/music/`，无需改本文件。
 */
export const HEADER_MUSIC_TITLE_OVERRIDES: Record<string, string> = {
  "Starling8,DRODUMANA,FIVESTAR - 苦茶子.mp3": "苦茶子 · Starling8 / DRODUMANA / FIVESTAR",
};

export function isMusicFileName(name: string): boolean {
  if (!name || name.startsWith(".")) return false;
  return AUDIO_EXT.test(name);
}

/** 从文件名生成展示标题：优先「艺人 - 歌名」，否则去扩展名 */
export function titleFromMusicFileName(fileName: string): string {
  const override = HEADER_MUSIC_TITLE_OVERRIDES[fileName];
  if (override) return override;
  const base = fileName.replace(AUDIO_EXT, "").trim();
  const dash = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) return `${dash[2].trim()} · ${dash[1].trim()}`;
  return base || fileName;
}

export function trackFromMusicFileName(fileName: string): HeaderMusicTrack {
  return {
    id: fileName,
    title: titleFromMusicFileName(fileName),
    fileName,
  };
}

export function tracksFromMusicFileNames(fileNames: string[]): HeaderMusicTrack[] {
  return fileNames
    .filter(isMusicFileName)
    .map(trackFromMusicFileName)
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export function headerMusicTrackSrc(fileName: string): string {
  return `/music/${encodeURIComponent(fileName)}`;
}

export function headerMusicDefaultTrackId(tracks: HeaderMusicTrack[]): string {
  return tracks[0]?.id ?? "";
}

export async function fetchMusicTracks(): Promise<HeaderMusicTrack[]> {
  const res = await fetch("/api/music-tracks", { cache: "no-store" });
  if (!res.ok) throw new Error(`加载曲目失败：${res.status}`);
  const data = (await res.json()) as { tracks?: HeaderMusicTrack[] };
  if (!Array.isArray(data.tracks)) return [];
  return data.tracks.filter(
    (t) => t && typeof t.id === "string" && typeof t.fileName === "string" && typeof t.title === "string",
  );
}
