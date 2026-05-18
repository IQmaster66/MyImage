import type { Metadata } from "next";
import { ImageToolbox } from "@/components/toolbox/image-toolbox";

export const metadata: Metadata = {
  title: "工具箱 · MyImage",
  description: "本地图片格式转换、压缩、缩放、旋转、裁剪与水印",
};

export default function ToolboxPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-emerald-50/50 dark:bg-emerald-950/30">
      <ImageToolbox />
    </div>
  );
}
