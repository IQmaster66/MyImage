/** Parse PNG tEXt / zTXt / iTXt chunks (common for AI tool prompts & generation params). */

export type PngTextChunkEntry = {
  chunkType: "tEXt" | "zTXt" | "iTXt";
  keyword: string;
  text: string;
};

const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/** Copy into a standalone `ArrayBuffer` for `Blob` / stream APIs. */
function asBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return latin1(bytes);
  }
}

/** Try zlib-wrapped deflate (zTXt / compressed iTXt). */
async function inflateZlib(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === "undefined") return null;

  if (bytes.length > 6) {
    const raw = bytes.subarray(2, bytes.length - 4);
    try {
      const ds = new DecompressionStream("deflate-raw");
      const out = await new Response(
        new Blob([asBlobPart(raw)]).stream().pipeThrough(ds),
      ).arrayBuffer();
      return utf8(new Uint8Array(out));
    } catch {
      /* try full zlib next */
    }
  }

  try {
    const ds = new DecompressionStream("deflate");
    const out = await new Response(
      new Blob([asBlobPart(bytes)]).stream().pipeThrough(ds),
    ).arrayBuffer();
    return utf8(new Uint8Array(out));
  } catch {
    return null;
  }
}

function parseITxtHeader(data: Uint8Array): {
  keyword: string;
  compressionFlag: number;
  textBytes: Uint8Array;
} | null {
  const kEnd = data.indexOf(0);
  if (kEnd <= 0) return null;
  const keyword = utf8(data.subarray(0, kEnd));
  let p = kEnd + 1;
  if (p + 1 >= data.length) return null;
  const compressionFlag = data[p++];
  const compressionMethod = data[p++];
  if (compressionMethod !== 0) return null;

  const langEnd = data.indexOf(0, p);
  if (langEnd < 0) return null;
  p = langEnd + 1;

  const tkEnd = data.indexOf(0, p);
  if (tkEnd < 0) return null;
  p = tkEnd + 1;

  return { keyword, compressionFlag, textBytes: data.subarray(p) };
}

export function isPngBuffer(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer);
  if (u8.length < 8) return false;
  for (let i = 0; i < 8; i++) if (u8[i] !== PNG_SIG[i]) return false;
  return true;
}

export async function extractPngTextChunks(buffer: ArrayBuffer): Promise<PngTextChunkEntry[]> {
  const u8 = new Uint8Array(buffer);
  if (!isPngBuffer(buffer)) return [];

  const view = new DataView(buffer);
  const out: PngTextChunkEntry[] = [];
  let offset = 8;

  while (offset + 12 <= u8.length) {
    const length = view.getUint32(offset, false);
    const type =
      String.fromCharCode(
        u8[offset + 4],
        u8[offset + 5],
        u8[offset + 6],
        u8[offset + 7],
      ) || "";
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > u8.length) break;

    const data = u8.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const z = data.indexOf(0);
      if (z >= 0) {
        const keyword = latin1(data.subarray(0, z));
        const text = latin1(data.subarray(z + 1));
        out.push({ chunkType: "tEXt", keyword, text });
      }
    } else if (type === "zTXt") {
      const z = data.indexOf(0);
      if (z >= 0 && z + 2 <= data.length) {
        const keyword = latin1(data.subarray(0, z));
        const method = data[z + 1];
        const compressed = data.subarray(z + 2);
        if (method === 0) {
          const text = (await inflateZlib(compressed)) ?? "（zTXt 压缩数据，当前环境无法解压）";
          out.push({ chunkType: "zTXt", keyword, text });
        }
      }
    } else if (type === "iTXt") {
      const parsed = parseITxtHeader(data);
      if (parsed) {
        const { keyword, compressionFlag, textBytes } = parsed;
        if (compressionFlag === 0) {
          out.push({ chunkType: "iTXt", keyword, text: utf8(textBytes) });
        } else {
          const text =
            (await inflateZlib(textBytes)) ?? "（iTXt 压缩数据，当前环境无法解压）";
          out.push({ chunkType: "iTXt", keyword, text });
        }
      }
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  return out;
}
