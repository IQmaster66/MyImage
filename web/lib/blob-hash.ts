/** 计算 Blob 的 SHA-256（十六进制小写），用于去重与服务端存储。 */
export async function sha256HexFromBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
