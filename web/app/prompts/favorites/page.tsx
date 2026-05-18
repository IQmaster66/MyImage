import { PromptsLibraryPanel } from "@/components/prompts/prompts-library-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "收藏 · 提示词 · MyImage",
  description: "收藏的提示词片段",
};

export default function PromptsFavoritesPage() {
  return (
    <PromptsLibraryPanel
      favoritedOnly
      title="收藏"
      description="仅显示已加入收藏的片段。"
    />
  );
}
