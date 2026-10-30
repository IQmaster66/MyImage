import { PromptsLibraryPanel } from "@/components/prompts/prompts-library-panel";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "提示词 · MyImage",
  description: "提示词编写、分类与收藏",
};

export default function PromptsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <p className="text-sm text-gray-500">加载提示词…</p>
        </main>
      }
    >
      <PromptsLibraryPanel
        favoritedOnly={false}
        enableCategoryFilter
        showWorkbench
        title="词库"
        description="上方编写正/负向提示词，下方按分类浏览片段；可一键追加到工作台。"
      />
    </Suspense>
  );
}
