import {
  convertImageFileToJpeg,
  jpgNameFromPngName,
  type PngToJpegOptions,
} from "@/lib/image-toolbox";

export type FolderPngEntry = {
  /** 相对所选根目录的路径，如 `sub/a.png` */
  relativePath: string;
  fileName: string;
  file: File;
};

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function isPngName(name: string): boolean {
  return /\.png$/i.test(name);
}

async function walkDirectoryPngs(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FolderPngEntry[],
): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (!isPngName(handle.name)) continue;
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      out.push({
        relativePath: prefix ? `${prefix}/${handle.name}` : handle.name,
        fileName: handle.name,
        file,
      });
    } else if (handle.kind === "directory") {
      const child = handle as FileSystemDirectoryHandle;
      const next = prefix ? `${prefix}/${child.name}` : child.name;
      await walkDirectoryPngs(child, next, out);
    }
  }
}

/** 用系统文件夹选择器只读扫描目录内全部 PNG（含子文件夹）；不修改源文件 */
export async function pickFolderPngEntries(): Promise<{
  dirName: string;
  entries: FolderPngEntry[];
}> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    throw new Error("当前浏览器不支持选择文件夹，请改用「兼容选择」");
  }
  const root = await picker.call(window, { mode: "read" });
  const entries: FolderPngEntry[] = [];
  await walkDirectoryPngs(root, "", entries);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
  return { dirName: root.name, entries };
}

/** `<input webkitdirectory>` 得到的 FileList → PNG 列表（webkitRelativePath） */
export function entriesFromWebkitFileList(list: FileList | File[]): FolderPngEntry[] {
  const files = Array.from(list);
  const out: FolderPngEntry[] = [];
  for (const file of files) {
    if (!isPngName(file.name) && file.type !== "image/png") continue;
    const relativePath =
      "webkitRelativePath" in file && typeof file.webkitRelativePath === "string" && file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    out.push({ relativePath, fileName: file.name, file });
  }
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
  return out;
}

export type ConvertFolderProgress = {
  index: number;
  total: number;
  relativePath: string;
  status: "ok" | "skip" | "error";
  message?: string;
  inBytes?: number;
  outBytes?: number;
};

export type ConvertFolderResult = {
  ok: number;
  skipped: number;
  failed: number;
  inBytes: number;
  outBytes: number;
  errors: { path: string; message: string }[];
  zipParts: { path: string; blob: Blob }[];
};

export type ConvertFolderOptions = PngToJpegOptions & {
  pngOnly?: boolean;
  onProgress?: (p: ConvertFolderProgress) => void;
  signal?: AbortSignal;
};

/** 将 PNG 转为 JPG，仅收集结果用于 ZIP；不读写磁盘源文件 */
export async function convertFolderPngs(
  entries: FolderPngEntry[],
  options: ConvertFolderOptions = {},
): Promise<ConvertFolderResult> {
  const pngOnly = options.pngOnly !== false;
  const jpegOpts: PngToJpegOptions = {
    quality: options.quality,
    maxEdge: options.maxEdge,
    matteColor: options.matteColor,
  };

  const list = pngOnly ? entries.filter((e) => isPngName(e.fileName)) : entries;
  const result: ConvertFolderResult = {
    ok: 0,
    skipped: 0,
    failed: 0,
    inBytes: 0,
    outBytes: 0,
    errors: [],
    zipParts: [],
  };

  for (let i = 0; i < list.length; i++) {
    if (options.signal?.aborted) {
      throw new DOMException("已取消", "AbortError");
    }
    const entry = list[i]!;
    const inBytes = entry.file.size;
    try {
      const blob = await convertImageFileToJpeg(entry.file, jpegOpts);
      const jpgName = jpgNameFromPngName(entry.fileName);
      const jpgRel = entry.relativePath.replace(/[^/\\]+$/, jpgName).replace(/\\/g, "/");
      result.zipParts.push({ path: jpgRel, blob });

      result.ok += 1;
      result.inBytes += inBytes;
      result.outBytes += blob.size;
      options.onProgress?.({
        index: i + 1,
        total: list.length,
        relativePath: entry.relativePath,
        status: "ok",
        inBytes,
        outBytes: blob.size,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "转换失败";
      result.failed += 1;
      result.errors.push({ path: entry.relativePath, message });
      options.onProgress?.({
        index: i + 1,
        total: list.length,
        relativePath: entry.relativePath,
        status: "error",
        message,
        inBytes,
      });
    }
  }

  return result;
}
