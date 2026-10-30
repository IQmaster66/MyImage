import { ImagesAdminPanel } from "@/components/admin/images-admin-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "后台管理 · 图片 · MyImage",
  description: "管理 MinIO 中的临时插画与人物百科配图",
};

export default function ImagesAdminPage() {
  return <ImagesAdminPanel />;
}
