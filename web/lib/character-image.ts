/** 将用户选择的图片压成适合本地 IndexedDB 的 JPEG data URL（最长边上限） */
export async function fileToStoredImageDataUrl(file: File, maxEdge = 1200, quality = 0.88): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.type === "image/svg+xml") {
    return readFileAsDataUrl(file);
  }

  const bmp = await createImageBitmap(file);
  let { width, height } = bmp;
  const edge = Math.max(width, height);
  if (edge > maxEdge) {
    const scale = maxEdge / edge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("读取失败"));
    r.readAsDataURL(file);
  });
}

/** 压成 JPEG Blob，用于上传到 MinIO */
export async function fileToJpegBlob(file: File, maxEdge = 2000, quality = 0.9): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.type === "image/svg+xml") {
    return file;
  }

  const bmp = await createImageBitmap(file);
  let { width, height } = bmp;
  const edge = Math.max(width, height);
  if (edge > maxEdge) {
    const scale = maxEdge / edge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片编码失败"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 上传用：SVG 原样，栅格图转 JPEG */
export async function fileToUploadableImageBlob(file: File): Promise<{ blob: Blob; filename: string }> {
  if (file.type === "image/svg+xml") {
    return { blob: file, filename: `upload-${crypto.randomUUID()}.svg` };
  }
  const blob = await fileToJpegBlob(file, 2000, 0.9);
  return { blob, filename: `upload-${crypto.randomUUID()}.jpg` };
}
