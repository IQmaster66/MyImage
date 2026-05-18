export type HeaderMusicTrack = {
  /** 稳定键，写入 localStorage */
  id: string;
  /** 列表与设置中展示的名称 */
  title: string;
  /** 相对 `public/music/` 的文件名（可含空格、逗号等） */
  fileName: string;
};

/**
 * 站点顶部播放器曲目表。将 mp3 放入 `web/public/music/` 后在此追加一项即可。
 */
export const HEADER_MUSIC_TRACKS: HeaderMusicTrack[] = [
  {
    id: "kuchazi",
    title: "苦茶子 · Starling8 / DRODUMANA / FIVESTAR",
    fileName: "Starling8,DRODUMANA,FIVESTAR - 苦茶子.mp3",
  },
];

export function headerMusicTrackSrc(fileName: string): string {
  return `/music/${encodeURIComponent(fileName)}`;
}

export function headerMusicDefaultTrackId(): string {
  return HEADER_MUSIC_TRACKS[0]?.id ?? "";
}
