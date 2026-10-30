import { redirect } from "next/navigation";

/** 标签反推已并入工具箱，保留此路由便于旧链接跳转 */
export default function TaggerRedirectPage() {
  redirect("/toolbox?tab=tagger");
}
