export type CharacterEntry = {
  id: string;
  name: string;
  prompt: string;
  /** MinIO 对象键 */
  imageKey: string;
  createdAt: number;
  updatedAt: number;
};

export function characterHasImage(e: CharacterEntry): boolean {
  return Boolean(e.imageKey?.trim());
}
