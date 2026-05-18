import { z } from "zod";

/** 后端列表接口返回的单条图片元数据（示例，可按 MinIO / 业务字段调整） */
export const galleryItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mimeType: z.string().optional(),
});

export const galleryListSchema = z.array(galleryItemSchema);

export type GalleryItem = z.infer<typeof galleryItemSchema>;
