import { CharacterEncyclopedia } from "@/components/character/character-encyclopedia";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "人物百科 · MyImage",
  description: "本地人物卡片：图片、姓名与提示词",
};

export default function CharacterPage() {
  return <CharacterEncyclopedia />;
}
