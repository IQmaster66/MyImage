"use client";

import { usePromptCategories } from "@/hooks/use-prompt-categories";
import { fileToUploadableImageBlob } from "@/lib/character-image";
import { postUploadPromptPreviewImage } from "@/lib/ml-api";
import { resolvePromptPreviewSrc, tryDeletePromptPreviewKey } from "@/lib/prompt-preview-image";
import { putPrompt } from "@/lib/prompts-db";
import {
  flattenCategoryOptions,
  newPromptEntry,
  parseTagsInput,
  PROMPT_KIND_LABELS,
  UNCATEGORIZED_ID,
  type PromptEntry,
  type PromptKind,
} from "@/lib/prompts-types";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  open: boolean;
  /** 有 id 为编辑；新建时为 null */
  entry: PromptEntry | null;
  defaultTitle?: string;
  defaultBody?: string;
  defaultKind?: PromptKind;
  /** 新建时默认分类 */
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function PromptEditorModal({
  open,
  entry,
  defaultTitle = "",
  defaultBody = "",
  defaultKind = "positive",
  defaultCategoryId = UNCATEGORIZED_ID,
  onClose,
  onSaved,
}: Props) {
  const { categories } = usePromptCategories();
  const categoryOptions = useMemo(() => flattenCategoryOptions(categories), [categories]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PromptKind>("positive");
  const [categoryId, setCategoryId] = useState(UNCATEGORIZED_ID);
  const [tagsStr, setTagsStr] = useState("");
  const [favorited, setFavorited] = useState(false);
  const [pickedPreviewKey, setPickedPreviewKey] = useState<string | null>(null);
  const [previewRemoved, setPreviewRemoved] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clearBlobPreview = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      clearBlobPreview();
      return;
    }
    setErr(null);
    setPickedPreviewKey(null);
    setPreviewRemoved(false);
    clearBlobPreview();
    if (entry) {
      setTitle(entry.title);
      setBody(entry.body);
      setKind(entry.kind);
      setCategoryId(entry.categoryId || UNCATEGORIZED_ID);
      setTagsStr(entry.tags.join(", "));
      setFavorited(entry.favorited);
      setPreviewSrc("");
      let cancelled = false;
      void resolvePromptPreviewSrc(entry).then((u) => {
        if (!cancelled && u) setPreviewSrc(u);
      });
      return () => {
        cancelled = true;
      };
    }
    setTitle(defaultTitle || "未命名片段");
    setBody(defaultBody);
    setKind(defaultKind);
    setCategoryId(defaultCategoryId || UNCATEGORIZED_ID);
    setTagsStr("");
    setFavorited(false);
    setPreviewSrc("");
    return undefined;
  }, [open, entry, defaultTitle, defaultBody, defaultKind, defaultCategoryId]);

  const onPickPreviewImage = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setErr(null);
    try {
      const { blob, filename } = await fileToUploadableImageBlob(file);
      const { object_key } = await postUploadPromptPreviewImage(blob, filename);
      clearBlobPreview();
      const u = URL.createObjectURL(blob);
      blobUrlRef.current = u;
      setPreviewSrc(u);
      setPickedPreviewKey(object_key);
      setPreviewRemoved(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败（请确认 ML API 与 MinIO 已启动）");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const removePreview = () => {
    clearBlobPreview();
    setPreviewSrc("");
    setPickedPreviewKey(null);
    setPreviewRemoved(true);
  };

  if (!open) return null;

  const handleSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      const tags = parseTagsInput(tagsStr);
      const previousKey = entry?.previewImageKey;
      const finalKey = previewRemoved
        ? undefined
        : pickedPreviewKey ?? (entry?.previewImageKey?.trim() || undefined);

      if (entry) {
        const next: PromptEntry = {
          ...entry,
          title: title.trim() || "未命名",
          body,
          kind,
          categoryId,
          tags,
          favorited,
          updatedAt: Date.now(),
        };
        delete next.previewImage;
        if (finalKey) next.previewImageKey = finalKey;
        else delete next.previewImageKey;
        await putPrompt(next);
        if (previousKey && previousKey !== finalKey) {
          await tryDeletePromptPreviewKey(previousKey);
        }
      } else {
        const row = newPromptEntry({
          title: title.trim() || "未命名",
          body,
          kind,
          categoryId,
          tags,
          favorited,
          previewImageKey: finalKey,
        });
        await putPrompt(row);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-[121] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 id="prompt-editor-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {entry ? "编辑片段" : "新建片段"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            标题
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            分类
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            >
              <option value={UNCATEGORIZED_ID}>未分类</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            类型
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PromptKind)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            >
              {(Object.keys(PROMPT_KIND_LABELS) as PromptKind[]).map((k) => (
                <option key={k} value={k}>
                  {PROMPT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            标签（逗号分隔，可选）
            <input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="例如：金发, 室内"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <div className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            <span>效果参考图（可选）</span>
            <div className="mt-1.5 flex flex-wrap items-start gap-3">
              {previewSrc && !previewRemoved ? (
                <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt="效果参考图预览"
                    className="h-24 w-24 object-cover sm:h-28 sm:w-28"
                  />
                </div>
              ) : (
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-[10px] leading-snug text-gray-400 sm:h-28 sm:w-28 dark:border-gray-600 dark:bg-zinc-950"
                >
                  未导入
                </div>
              )}
              <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100 dark:hover:bg-zinc-800">
                  {imageBusy ? "上传中…" : "选择图片"}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={imageBusy || busy}
                    onChange={(e) => void onPickPreviewImage(e.target.files?.[0])}
                  />
                </label>
                {previewSrc && !previewRemoved ? (
                  <button
                    type="button"
                    disabled={imageBusy || busy}
                    onClick={removePreview}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-red-950/30"
                  >
                    移除图片
                  </button>
                ) : null}
                <p className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                  图片上传到 MinIO（prompt-previews/），词库条目只保存对象键；需 ML API 与 MinIO 可用。
                </p>
              </div>
            </div>
          </div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            正文
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={favorited}
              onChange={(e) => setFavorited(e.target.checked)}
              className="rounded border-gray-400 text-emerald-600"
            />
            加入收藏
          </label>
          {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={() => void handleSave()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
