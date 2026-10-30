import { CharacterEncyclopedia } from "@/components/character/character-encyclopedia";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "人物百科 · MyImage",
  description: "本地人物卡片：图片、姓名、出自与提示词",
};

export default function CharacterPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <p className="text-sm text-gray-500">加载人物百科…</p>
        </main>
      }
    >
      <CharacterEncyclopedia />
    </Suspense>
  );
}
