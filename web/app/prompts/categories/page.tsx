import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "分类词库 · 提示词 · MyImage",
  description: "按主题分类整理的提示词片段",
};

/** 旧路径兼容：分类词库已合并到 /prompts */
export default async function PromptsCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = sp.category;
  const value = Array.isArray(category) ? category[0] : category;
  if (value) {
    redirect(`/prompts?category=${encodeURIComponent(value)}`);
  }
  redirect("/prompts");
}
