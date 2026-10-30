import { buildAndDownloadZip, zipFilenameWithDate } from "@/lib/gallery-zip-export";
import { supportsDirectoryPicker } from "@/lib/png-folder-convert";

export type FolderImageEntry = {
  /** 相对所选根目录的路径，如 `sub/a.jpg` */
  relativePath: string;
  fileName: string;
  /**
   * 修改时间（ms）。原生选文件夹时可能先为 0，后台补齐后再参与日期排序。
   * 兼容选择（webkitdirectory）一开始就有。
   */
  lastModified: number;
  /** 已解析的 File；原生选择可能懒加载 */
  file: File | null;
  /** File System Access 句柄；兼容选择无此字段 */
  handle?: FileSystemFileHandle;
};

/** 浏览列表排序：名称 / 修改日期 × 升序 / 降序 */
export type FolderBrowseSortBy = "name" | "date";
export type FolderBrowseSortDir = "asc" | "desc";

export type FolderBrowseSortMode = {
  by: FolderBrowseSortBy;
  dir: FolderBrowseSortDir;
};

export const DEFAULT_FOLDER_BROWSE_SORT: FolderBrowseSortMode = { by: "name", dir: "asc" };

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

export function isFolderImageName(name: string): boolean {
  return IMAGE_EXT_RE.test(name);
}

function isFolderImageFile(file: File): boolean {
  if (isFolderImageName(file.name)) return true;
  const t = (file.type || "").toLowerCase();
  return t.startsWith("image/") && !t.includes("svg");
}

/** Schwartzian：先算键再排，避免比较器里反复 localeCompare / 读属性 */
export function sortFolderImageEntries(
  entries: FolderImageEntry[],
  mode: FolderBrowseSortMode = DEFAULT_FOLDER_BROWSE_SORT,
): FolderImageEntry[] {
  if (entries.length < 2) return entries.slice();
  const mul = mode.dir === "asc" ? 1 : -1;

  if (mode.by === "date") {
    const decorated = entries.map((e, i) => ({
      e,
      i,
      t: e.lastModified || 0,
      // 同时间用路径稳定次序
      p: e.relativePath,
    }));
    decorated.sort((a, b) => {
      if (a.t !== b.t) return (a.t - b.t) * mul;
      const c = a.p < b.p ? -1 : a.p > b.p ? 1 : 0;
      return c * mul || a.i - b.i;
    });
    return decorated.map((d) => d.e);
  }

  // 名称：Collator 复用，比每次 localeCompare 更快
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  const decorated = entries.map((e, i) => ({
    e,
    i,
    key: e.relativePath,
  }));
  decorated.sort((a, b) => {
    const c = collator.compare(a.key, b.key);
    if (c !== 0) return c * mul;
    return a.i - b.i;
  });
  return decorated.map((d) => d.e);
}

/** 确保条目有可用 File（原生选择懒加载时调用） */
export async function ensureFolderEntryFile(entry: FolderImageEntry): Promise<File> {
  if (entry.file) {
    if (!entry.lastModified && entry.file.lastModified) {
      entry.lastModified = entry.file.lastModified;
    }
    return entry.file;
  }
  if (!entry.handle) {
    throw new Error(`无法读取「${entry.relativePath}」`);
  }
  const file = await entry.handle.getFile();
  entry.file = file;
  entry.lastModified = file.lastModified || 0;
  return file;
}

const HYDRATE_CONCURRENCY = 12;

/** 后台批量补齐 lastModified / file，不阻塞首屏浏览 */
export async function hydrateFolderEntriesMeta(
  entries: FolderImageEntry[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<void> {
  const pending = entries.filter((e) => !e.lastModified || !e.file);
  if (!pending.length) return;

  let done = entries.length - pending.length;
  const total = entries.length;
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      if (options?.signal?.aborted) return;
      const i = cursor;
      cursor += 1;
      const entry = pending[i]!;
      try {
        await ensureFolderEntryFile(entry);
      } catch {
        /* 单文件失败跳过，仍可按名称浏览 */
      }
      done += 1;
      options?.onProgress?.(done, total);
    }
  };

  const n = Math.min(HYDRATE_CONCURRENCY, pending.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function walkDirectoryImageHandles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FolderImageEntry[],
): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (!isFolderImageName(handle.name)) continue;
      const fileHandle = handle as FileSystemFileHandle;
      out.push({
        relativePath: prefix ? `${prefix}/${handle.name}` : handle.name,
        fileName: handle.name,
        lastModified: 0,
        file: null,
        handle: fileHandle,
      });
    } else if (handle.kind === "directory") {
      const child = handle as FileSystemDirectoryHandle;
      const next = prefix ? `${prefix}/${child.name}` : child.name;
      await walkDirectoryImageHandles(child, next, out);
    }
  }
}

export type PickFolderProgress = {
  phase: "listing" | "meta";
  listed: number;
  metaDone: number;
  metaTotal: number;
};

/**
 * 原生选文件夹：先只扫路径（快），立刻可按名称排序浏览；
 * 再并发补齐修改时间供日期排序。
 */
export async function pickFolderImageEntries(options?: {
  signal?: AbortSignal;
  onProgress?: (p: PickFolderProgress) => void;
  /** 列表扫完后立刻回调（尚无完整 mtime） */
  onListed?: (entries: FolderImageEntry[], dirName: string) => void;
}): Promise<{ dirName: string; entries: FolderImageEntry[] }> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    throw new Error("当前浏览器不支持选择文件夹，请改用「兼容选择」");
  }
  const root = await picker.call(window, { mode: "read" });
  if (options?.signal?.aborted) throw new DOMException("已取消", "AbortError");

  const entries: FolderImageEntry[] = [];
  await walkDirectoryImageHandles(root, "", entries);
  options?.onProgress?.({
    phase: "listing",
    listed: entries.length,
    metaDone: 0,
    metaTotal: entries.length,
  });
  options?.onListed?.(entries, root.name);

  if (entries.length) {
    await hydrateFolderEntriesMeta(entries, {
      signal: options?.signal,
      onProgress: (metaDone, metaTotal) => {
        options?.onProgress?.({
          phase: "meta",
          listed: entries.length,
          metaDone,
          metaTotal,
        });
      },
    });
  }

  return { dirName: root.name, entries };
}

/** `<input webkitdirectory>` → 图片列表（File 已带 lastModified，无需再扫盘） */
export function imageEntriesFromWebkitFileList(list: FileList | File[]): FolderImageEntry[] {
  const out: FolderImageEntry[] = [];
  for (const file of Array.from(list)) {
    if (!isFolderImageFile(file)) continue;
    const relativePath =
      "webkitRelativePath" in file && typeof file.webkitRelativePath === "string" && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    out.push({
      relativePath,
      fileName: file.name,
      lastModified: file.lastModified || 0,
      file,
    });
  }
  return out;
}

export { supportsDirectoryPicker };

/** 将仍保留的条目打包 ZIP 下载（保留相对路径；不读写源磁盘） */
export async function downloadRemainingFolderZip(
  entries: FolderImageEntry[],
  folderLabel?: string,
  options?: { onProgress?: (done: number, total: number) => void },
): Promise<string> {
  if (!entries.length) {
    throw new Error("没有可导出的图片");
  }
  const parts: { pathInZip: string; data: Blob }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const file = await ensureFolderEntryFile(e);
    parts.push({
      pathInZip: e.relativePath.replace(/\\/g, "/"),
      data: file,
    });
    options?.onProgress?.(i + 1, entries.length);
  }
  const prefix = folderLabel?.trim()
    ? `folder-kept-${folderLabel.trim().replace(/[/\\:*?"<>|]/g, "_").slice(0, 40)}`
    : "folder-kept";
  const name = zipFilenameWithDate(prefix);
  await buildAndDownloadZip(parts, name);
  return name;
}
