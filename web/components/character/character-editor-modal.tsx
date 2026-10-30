"use client";

import { ExportPreviewLightbox } from "@/components/toolbox/export-preview-lightbox";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { createCharacter, deleteCharacterApi, fetchCharacterSources, updateCharacter } from "@/lib/character-api";
import { fileToUploadableImageBlob } from "@/lib/character-image";
import {
  flattenSourceOptions,
  UNCATEGORIZED_SOURCE_ID,
  type CharacterEntry,
  type CharacterSource,
} from "@/lib/character-types";
import { deleteMinioObject, fetchMinioReadUrl, postUploadCharacterImage } from "@/lib/ml-api";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  open: boolean;
  entry: CharacterEntry | null;
  /** 新建时默认出自（例如当前侧栏筛选） */
  defaultSourceId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function CharacterEditorModal({ open, entry, defaultSourceId, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [promptClothed, setPromptClothed] = useState("");
  const [promptUnclothed, setPromptUnclothed] = useState("");
  const [sourceId, setSourceId] = useState(UNCATEGORIZED_SOURCE_ID);
  const [sources, setSources] = useState<CharacterSource[]>([]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const sourceOptions = useMemo(() => flattenSourceOptions(sources), [sources]);

  useBodyScrollLock(open);

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
    setPickedKey(null);
    setShowDeleteConfirm(false);
    setLightboxOpen(false);
    clearBlobPreview();

    let cancelled = false;
    void fetchCharacterSources()
      .then((list) => {
        if (!cancelled) setSources(list);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });

    if (entry) {
      setName(entry.name);
      setPromptClothed(entry.promptClothed || entry.prompt || "");
      setPromptUnclothed(entry.promptUnclothed || "");
      setSourceId(entry.sourceId || UNCATEGORIZED_SOURCE_ID);
      setPreviewSrc("");
      void fetchMinioReadUrl(entry.imageKey)
        .then((u) => {
          if (!cancelled) setPreviewSrc(u);
        })
        .catch(() => {
          if (!cancelled) setPreviewSrc("");
        });
      return () => {
        cancelled = true;
      };
    }

    setName("");
    setPromptClothed("");
    setPromptUnclothed("");
    setSourceId(defaultSourceId ?? UNCATEGORIZED_SOURCE_ID);
    setPreviewSrc("");
    return () => {
      cancelled = true;
    };
  }, [open, entry?.id, defaultSourceId]);

  if (!open) return null;

  const onPickFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const { blob, filename } = await fileToUploadableImageBlob(f);
      const { object_key } = await postUploadCharacterImage(blob, filename);
      clearBlobPreview();
      const u = URL.createObjectURL(blob);
      blobUrlRef.current = u;
      setPreviewSrc(u);
      setPickedKey(object_key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败（请确认 ML API 已启动且已配置 MinIO）");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const finalKey = pickedKey ?? entry?.imageKey ?? null;
    if (!finalKey) {
      setErr("请添加人物图片（上传到 MinIO）");
      return;
    }
    const n = name.trim();
    setBusy(true);
    setErr(null);
    const uploadedThisSession = pickedKey;
    try {
      if (entry) {
        await updateCharacter(entry.id, {
          name: n,
          promptClothed: promptClothed.trim(),
          promptUnclothed: promptUnclothed.trim(),
          sourceId,
          imageKey: finalKey,
        });
      } else {
        await createCharacter({
          id: crypto.randomUUID(),
          name: n,
          promptClothed: promptClothed.trim(),
          promptUnclothed: promptUnclothed.trim(),
          sourceId,
          imageKey: finalKey,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      if (!entry && uploadedThisSession) {
        void deleteMinioObject(uploadedThisSession).catch(() => {});
      }
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!entry) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteCharacterApi(entry.id);
      setShowDeleteConfirm(false);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setShowDeleteConfirm(false);
    clearBlobPreview();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-editor-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="关闭" onClick={handleClose} />
      <div className="relative z-[121] flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-zinc-900">
        {entry && showDeleteConfirm ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={() => !busy && setShowDeleteConfirm(false)}
          >
            <div
              role="alertdialog"
              aria-labelledby="delete-confirm-title"
              aria-describedby="delete-confirm-desc"
              className="w-full max-w-sm rounded-xl border border-red-200/80 bg-white p-4 shadow-2xl dark:border-red-900/50 dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="delete-confirm-title" className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                删除「{entry.name.trim() || "未命名"}」？
              </h3>
              <p id="delete-confirm-desc" className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                将从人物百科中移除该卡片：服务端 SQLite 中的姓名与两套提示词会删除，MinIO 中的封面图也会一并删除。
                <span className="mt-1 block font-medium text-red-700 dark:text-red-400">此操作无法撤销。</span>
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
                >
                  先不删
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runDelete()}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 id="character-editor-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {entry ? "编辑人物" : "添加人物"}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (entry && showDeleteConfirm) {
                setShowDeleteConfirm(false);
                return;
              }
              handleClose();
            }}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-zinc-800"
            aria-label={entry && showDeleteConfirm ? "返回编辑" : "关闭"}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">人物图片（上传 MinIO；记录存 SQLite）</p>
            <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
              <div className="relative aspect-[3/4] w-full max-w-[10rem] shrink-0 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-zinc-950">
                {previewSrc ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label="放大查看人物图片"
                    className="group relative h-full w-full p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewSrc}
                      alt=""
                      className="h-full w-full cursor-zoom-in object-cover transition group-hover:brightness-[0.92]"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-4 text-center text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                      点击放大
                    </span>
                  </button>
                ) : (
                  <div className="flex h-full min-h-[8rem] items-center justify-center px-2 text-center text-xs text-gray-400">
                    {busy ? "处理中…" : "未选择"}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700">
                  {previewSrc ? "更换图片" : "选择图片"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="sr-only"
                    onChange={(e) => void onPickFile(e.target.files?.[0])}
                  />
                </label>
                {previewSrc ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
                  >
                    放大查看
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            人物姓名（可留空）
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：角色名；留空显示为未命名"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            出自
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            >
              <option value={UNCATEGORIZED_SOURCE_ID}>未归类</option>
              {sourceOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            带服装提示词
            <textarea
              value={promptClothed}
              onChange={(e) => setPromptClothed(e.target.value)}
              rows={4}
              placeholder="含服装、配饰等描述的提示词…"
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            不带服装提示词
            <textarea
              value={promptUnclothed}
              onChange={(e) => setPromptUnclothed(e.target.value)}
              rows={4}
              placeholder="不含服装描述的人物本体提示词…"
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-100"
            />
          </label>
          {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <div>
            {entry ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
              >
                删除人物…
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>

      {lightboxOpen && previewSrc ? (
        <ExportPreviewLightbox
          url={previewSrc}
          ariaLabel={`放大：${name.trim() || entry?.name || "人物图片"}`}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}
