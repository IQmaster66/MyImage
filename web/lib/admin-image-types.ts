export type AdminImageKind = "temp" | "character";

export type AdminImageItem = {
  kind: AdminImageKind;
  id: string;
  title: string;
  imageKey: string;
  sortAt: number;
  mimeType?: string;
  sdRaw?: string | null;
  subtitle?: string;
  contentSha256?: string;
};

export type AdminTab = "all" | "temp" | "character" | "duplicates" | "maintenance";

export type AdminSelectionKey = `${AdminImageKind}:${string}`;

export function adminItemKey(item: AdminImageItem): AdminSelectionKey {
  return `${item.kind}:${item.id}`;
}
