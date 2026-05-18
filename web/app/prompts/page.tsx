import { PromptsWorkbench } from "@/components/prompts/prompts-workbench";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "提示词 · MyImage",
  description: "提示词编写、分类与收藏",
};

export default function PromptsPage() {
  return <PromptsWorkbench />;
}
