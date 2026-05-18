import { TempIllustrationGallery } from "@/components/temp-illustration/temp-illustration-gallery";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "临时插画 · MyImage",
  description: "本地暂存插画与 SD 生成参数查看",
};

export default function TempIllustrationPage() {
  return <TempIllustrationGallery />;
}
