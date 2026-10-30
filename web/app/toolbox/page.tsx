import type { Metadata } from "next";
import { ImageToolbox } from "@/components/toolbox/image-toolbox";

export const metadata: Metadata = {
  title: "工具箱 · MyImage",
  description: "本地图片编辑导出、WD14 动漫标签反推与 SD 元数据读取",
};

export default function ToolboxPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ImageToolbox />
    </div>
  );
}
