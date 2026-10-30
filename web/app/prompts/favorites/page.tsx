import { PromptsLibraryPanel } from "@/components/prompts/prompts-library-panel";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "收藏 · 提示词 · MyImage",
  description: "收藏的提示词片段",
};

export default function PromptsFavoritesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <p className="text-sm text-gray-500">加载收藏…</p>
        </main>
      }
    >
      <PromptsLibraryPanel
        favoritedOnly
        title="收藏"
        description="仅显示已加入收藏的片段。"
      />
    </Suspense>
  );
}
