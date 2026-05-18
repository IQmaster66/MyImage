import { RecommendGallery } from "@/components/recommend/recommend-gallery";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "推荐 · MyImage",
  description: "浏览临时插画与人物配图（纯图片展示）",
};

export default function RecommendPage() {
  return <RecommendGallery />;
}
