"use client";

import { TempIllustrationRemoveConfirmDialog } from "@/components/temp-illustration/temp-illustration-remove-confirm";
import { ExportPreviewLightbox } from "@/components/toolbox/export-preview-lightbox";
import { SdParametersCard } from "@/components/toolbox/sd-parameters-card";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { deleteTempIllustration, fetchTempIllustrationBlob } from "@/lib/temp-illustration-api";
import type { TempIllustrationEntry } from "@/lib/temp-illustration-types";
import { fetchMinioReadUrl } from "@/lib/ml-api";
import { queueToolboxHandoff } from "@/lib/toolbox-handoff";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  entry: TempIllustrationEntry | null;
  onClose: () => void;
  onDeleted?: () => void;
};

export function TempIllustrationDetailModal({ entry, onClose, onDeleted }: Props) {
  const router = useRouter();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffErr, setHandoffErr] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useBodyScrollLock(Boolean(entry));

  useEffect(() => {
    if (!entry) {
      setObjectUrl(null);
      return;
    }
    let cancelled = false;
    setObjectUrl(null);
    void fetchMinioReadUrl(entry.imageKey)
      .then((u) => {
        if (!cancelled) setObjectUrl(u);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  useEffect(() => {
    setShowRemoveConfirm(false);
    setHandoffErr(null);
    setLightboxOpen(false);
  }, [entry?.id]);

  if (!entry) return null;

  const dismissOrClose = () => {
    if (removeBusy) return;
    if (lightboxOpen) {
      setLightboxOpen(false);
      return;
    }
    if (showRemoveConfirm) {
      setShowRemoveConfirm(false);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="temp-ill-detail-title"
    >
      <button
        type="button"
        disabled={removeBusy}
        className="absolute inset-0 bg-black/55 disabled:pointer-events-none"
        aria-label="关闭"
        onClick={dismissOrClose}
      />
      <div className="relative z-[131] flex max-h-[min(94dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <h2 id="temp-ill-detail-title" className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {entry.title || "未命名"}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {entry.mimeType} · {new Date(entry.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <button
            type="button"
            disabled={removeBusy}
            onClick={dismissOrClose}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-zinc-800"
            aria-label={showRemoveConfirm ? "返回" : "关闭"}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex justify-center bg-gray-100/80 p-3 dark:bg-zinc-950/80">
            {objectUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label="放大查看图片"
                className="group relative max-w-full rounded-lg p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={objectUrl}
                  alt=""
                  className="max-h-[min(40dvh,28rem)] max-w-full cursor-zoom-in rounded-lg object-contain shadow-md transition group-hover:brightness-[0.97]"
                />
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">
                  点击放大
                </span>
              </button>
            ) : (
              <div className="flex h-40 items-center text-sm text-gray-500">加载预览…</div>
            )}
          </div>
          <div className="space-y-3 border-t border-gray-100 p-4 dark:border-gray-800">
            {entry.sdRaw?.trim() ? (
              <SdParametersCard raw={entry.sdRaw} />
            ) : (
              <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
                <p>
                  此图未检测到 SD / A1111 / ComfyUI 参数（可能来自去元数据导出或相机照片）。可转到工具箱使用{" "}
                  <strong className="font-semibold">BLIP 图片反推</strong> 或{" "}
                  <strong className="font-semibold">WD 标签反推</strong> 生成描述或标签。
                </p>
                {handoffErr ? (
                  <p className="rounded-md border border-red-300/80 bg-red-50/90 px-2 py-1.5 text-[11px] text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {handoffErr}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={handoffBusy}
                  onClick={() => {
                    setHandoffErr(null);
                    setHandoffBusy(true);
                    void fetchTempIllustrationBlob(entry)
                      .then((blob) =>
                        queueToolboxHandoff({
                          blob,
                          mimeType: entry.mimeType,
                          suggestedBaseName: entry.title || "temp-illustration",
                        }),
                      )
                      .then((hid) => {
                        router.push(`/toolbox?handoff=${encodeURIComponent(hid)}`);
                      })
                      .catch((e) => {
                        setHandoffErr(e instanceof Error ? e.message : "发送失败");
                      })
                      .finally(() => {
                        setHandoffBusy(false);
                      });
                  }}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {handoffBusy ? "正在准备…" : "发送到工具箱反推"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <button
            type="button"
            disabled={removeBusy}
            onClick={() => setShowRemoveConfirm(true)}
            className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            从临时插画移除…
          </button>
        </div>
      </div>

      <TempIllustrationRemoveConfirmDialog
        open={showRemoveConfirm}
        name={entry.title}
        busy={removeBusy}
        onCancel={() => setShowRemoveConfirm(false)}
        onConfirm={async () => {
          setRemoveBusy(true);
          try {
            await deleteTempIllustration(entry.id);
            setShowRemoveConfirm(false);
            onDeleted?.();
            onClose();
          } finally {
            setRemoveBusy(false);
          }
        }}
      />

      {lightboxOpen && objectUrl ? (
        <ExportPreviewLightbox
          url={objectUrl}
          ariaLabel={`放大：${entry.title || "临时插画"}`}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}
