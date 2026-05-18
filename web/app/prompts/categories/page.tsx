import { PromptsLibraryPanel } from "@/components/prompts/prompts-library-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分类词库 · 提示词 · MyImage",
  description: "按主题整理的提示词片段",
};

export default function PromptsCategoriesPage() {
  return (
    <PromptsLibraryPanel
      favoritedOnly={false}
      title="分类词库"
      description="本地 IndexedDB 存储，支持搜索与标签筛选。"
    />
  );
}
