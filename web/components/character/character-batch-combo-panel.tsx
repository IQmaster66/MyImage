"use client";

import { CopyFeedbackToast } from "@/components/copy-status-banner";
import type { CharacterEntry } from "@/lib/character-types";
import {
  batchComboMdFilename,
  buildBatchComboRows,
  downloadMarkdown,
  formatBatchComboMarkdown,
} from "@/lib/character-batch-combo";
import { reencodeCharacterImages } from "@/lib/character-api";
import { formatBytesShort } from "@/lib/image-toolbox";
import { getAllCategories, putPrompt } from "@/lib/prompts-db";
import { newPromptEntry, UNCATEGORIZED_ID } from "@/lib/prompts-types";
import { useMemo, useRef, useState } from "react";

type Props = {
  /** 当前出自筛选下的人物（含未配图） */
  characters: CharacterEntry[];
  /** 范围说明，写入 MD */
  scopeLabel: string;
  /** 当前筛选下已配图人数（ZIP） */
  withImageCount: number;
  /** 全库已配图人数（压缩 JPG） */
  allWithImageCount: number;
  zipBusy?: boolean;
  onExportZip?: () => void;
  /** 配图压缩完成后刷新列表 */
  onImagesChanged?: () => void;
};

async function resolveOutfitCategoryId(): Promise<string> {
  const cats = await getAllCategories();
  const hit = cats.find((c) => c.name.trim() === "服装配饰");
  return hit?.id ?? UNCATEGORIZED_ID;
}

function defaultSaveTitle(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `百科搭配 · ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CharacterBatchComboPanel({
  characters,
  scopeLabel,
  withImageCount,
  allWithImageCount,
  zipBusy = false,
  onExportZip,
  onImagesChanged,
}: Props) {
  const [shared, setShared] = useState("");
  const [busy, setBusy] = useState<"save" | "export" | "reencode" | null>(null);
  const [reencodeConfirmOpen, setReencodeConfirmOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sharedTrim = shared.trim();
  const hasShared = Boolean(sharedTrim);

  const eligibleCount = useMemo(
    () => characters.filter((c) => Boolean(c.promptUnclothed?.trim())).length,
    [characters],
  );

  const canAct = hasShared && eligibleCount > 0 && !busy && !zipBusy;

  const flash = (msg: string, ms = 3200) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(msg);
    hintTimer.current = setTimeout(() => {
      setHint(null);
      hintTimer.current = null;
    }, ms);
  };

  const emptyReason = !hasShared
    ? "请先输入共用提示词"
    : eligibleCount === 0
      ? "当前筛选下没有「不带服装」提示词的人物"
      : null;

  const onSaveLibrary = async () => {
    if (!canAct) {
      flash(emptyReason || "无法存库");
      return;
    }
    setBusy("save");
    try {
      const categoryId = await resolveOutfitCategoryId();
      const entry = newPromptEntry({
        title: defaultSaveTitle(),
        body: sharedTrim,
        kind: "positive",
        categoryId,
        tags: ["百科搭配"],
      });
      await putPrompt(entry);
      flash(categoryId === UNCATEGORIZED_ID ? "已存入词库（未分类）" : "已存入词库 · 服装配饰");
    } catch (e) {
      flash(e instanceof Error ? e.message : "存库失败");
    } finally {
      setBusy(null);
    }
  };

  const onExportMd = () => {
    if (!canAct) {
      flash(emptyReason || "无法导出");
      return;
    }
    setBusy("export");
    try {
      const { rows, skipped } = buildBatchComboRows(characters, sharedTrim);
      if (!rows.length) {
        flash("没有可导出的人物（均缺少不带服装提示词）");
        return;
      }
      const md = formatBatchComboMarkdown({
        shared: sharedTrim,
        scopeLabel,
        rows,
        skipped,
      });
      downloadMarkdown(batchComboMdFilename(), md);
      flash(
        skipped.length
          ? `已导出 ${rows.length} 人（跳过 ${skipped.length}）`
          : `已导出 ${rows.length} 人 MD`,
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(null);
    }
  };

  const zipDisabled = !withImageCount || zipBusy || Boolean(busy);
  const zipTitle = !withImageCount
    ? "当前筛选下没有已配图人物"
    : scopeLabel.startsWith("当前出自")
      ? "导出当前出自人物图 ZIP"
      : "导出全部人物图 ZIP";

  const reencodeDisabled = !allWithImageCount || zipBusy || Boolean(busy);

  const runReencode = async () => {
    if (reencodeDisabled) return;
    setBusy("reencode");
    try {
      const r = await reencodeCharacterImages({ quality: 85, maxEdge: 2000 });
      const saved = r.bytesBefore - r.bytesAfter;
      const parts = [
        `已处理：转换 ${r.converted}`,
        `跳过 ${r.skipped}`,
        r.failed ? `失败 ${r.failed}` : null,
        r.bytesBefore > 0
          ? `体积 ${formatBytesShort(r.bytesBefore)} → ${formatBytesShort(r.bytesAfter)}${
              saved > 0 ? `（约省 ${formatBytesShort(saved)}）` : ""
            }`
          : null,
      ].filter(Boolean);
      flash(parts.join(" · "), 6500);
      onImagesChanged?.();
      setReencodeConfirmOpen(false);
    } catch (e) {
      flash(e instanceof Error ? e.message : "压缩失败", 5000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside
      className="flex w-full shrink-0 flex-col rounded-2xl border border-emerald-200/80 bg-white/95 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-zinc-900/95 lg:sticky lg:top-20 lg:w-80 lg:self-start xl:w-96"
      aria-label="批量搭配"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-emerald-100 pb-3 dark:border-emerald-900/40">
        <p className="text-[10px] font-semibold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">
          批量搭配
        </p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
          {scopeLabel}
          <span className="mx-1 text-gray-300 dark:text-zinc-600">·</span>
          {eligibleCount}/{characters.length}
        </p>
      </div>

      <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
        共用提示词
      </label>
      <textarea
        value={shared}
        onChange={(e) => setShared(e.target.value)}
        rows={10}
        placeholder="school uniform, standing, cherry blossoms, …"
        className="mb-3 min-h-[10rem] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100 dark:placeholder:text-gray-500"
      />

      {!hasShared || eligibleCount === 0 ? (
        <p className="mb-3 text-[11px] leading-snug text-amber-700 dark:text-amber-400/90">
          {emptyReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!canAct}
          title={emptyReason ?? "存入提示词库"}
          onClick={() => void onSaveLibrary()}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-950"
        >
          {busy === "save" ? "存库中…" : "存入词库"}
        </button>
        <button
          type="button"
          disabled={!canAct}
          title={emptyReason ?? "搭配并导出 Markdown"}
          onClick={onExportMd}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === "export" ? "导出中…" : "搭配并导出 MD"}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-emerald-100 pt-3 dark:border-emerald-900/40">
        <button
          type="button"
          disabled={zipDisabled}
          title={zipTitle}
          onClick={() => onExportZip?.()}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 transition hover:border-emerald-300 hover:bg-emerald-50/80 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40"
        >
          {zipBusy
            ? "打包中…"
            : withImageCount
              ? `导出人物图 ZIP（${withImageCount}）`
              : "导出人物图 ZIP"}
        </button>
        <button
          type="button"
          disabled={reencodeDisabled}
          title={
            !allWithImageCount
              ? "全库没有已配图人物"
              : "将全部人物配图转为 JPEG（质量 85，最长边 2000），以减小 MinIO 占用"
          }
          onClick={() => setReencodeConfirmOpen(true)}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300/90 bg-amber-50 px-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
        >
          {busy === "reencode"
            ? "压缩中…"
            : allWithImageCount
              ? `压缩全部配图为 JPG（${allWithImageCount}）`
              : "压缩全部配图为 JPG"}
        </button>
      </div>

      {reencodeConfirmOpen ? (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          role="presentation"
          onClick={() => busy !== "reencode" && setReencodeConfirmOpen(false)}
        >
          <div
            role="alertdialog"
            aria-labelledby="char-reencode-title"
            aria-describedby="char-reencode-desc"
            className="w-full max-w-sm rounded-xl border border-amber-200/80 bg-white p-4 shadow-2xl dark:border-amber-900/50 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="char-reencode-title"
              className="text-sm font-semibold text-gray-900 dark:text-gray-50"
            >
              压缩全部人物配图为 JPG？
            </h3>
            <p
              id="char-reencode-desc"
              className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
            >
              将对全库约 {allWithImageCount}{" "}
              张配图在服务端转为 JPEG（质量 85，最长边不超过 2000px，透明区域铺白底），写回
              MinIO 并删除旧文件。已是 JPEG 且体积未缩小的会跳过。名称与提示词不变。
              <span className="mt-2 block font-medium text-amber-800 dark:text-amber-300">
                过程可能较久，请勿关闭页面；有损压缩后无法还原原图。
              </span>
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy === "reencode"}
                onClick={() => setReencodeConfirmOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy === "reencode" || !allWithImageCount}
                onClick={() => void runReencode()}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy === "reencode" ? "压缩中…" : "确认压缩"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CopyFeedbackToast message={hint} />
    </aside>
  );
}
