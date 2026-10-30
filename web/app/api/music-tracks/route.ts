import { tracksFromMusicFileNames } from "@/lib/header-music-tracks";
import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 扫描 `public/music/`，自动生成播放列表，无需手写登记 */
export async function GET() {
  const dir = path.join(process.cwd(), "public", "music");
  try {
    const names = await readdir(dir);
    const tracks = tracksFromMusicFileNames(names);
    return NextResponse.json({ tracks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读取音乐目录失败";
    return NextResponse.json({ tracks: [], error: msg }, { status: 200 });
  }
}
