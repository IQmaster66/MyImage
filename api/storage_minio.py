"""
人物百科等用的 MinIO 对象存储：服务端上传、预签名读、删除。

环境变量（见 api/.env.example）：
  MINIO_ENDPOINT=127.0.0.1:9000
  MINIO_ACCESS_KEY / MINIO_SECRET_KEY（或 MINIO_ROOT_USER / MINIO_ROOT_PASSWORD）
  MINIO_BUCKET=myimage
  MINIO_SECURE=false
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from datetime import timedelta

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from minio import Minio
from minio.error import S3Error
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/minio", tags=["minio"])

_mb = os.getenv("MAX_UPLOAD_MB")
MAX_UPLOAD_BYTES = int((_mb or "12").strip() or "12") * 1024 * 1024

PRESIGN_GET_HOURS = int(os.getenv("MINIO_PRESIGN_GET_HOURS", "24").strip() or "24")


def _env_or_default(key: str, default: str) -> str:
    raw = os.getenv(key)
    if raw is None:
        return default
    s = raw.strip().strip('"').strip("'")
    return s if s else default


def _endpoint_host_port() -> str:
    raw = _env_or_default("MINIO_ENDPOINT", "127.0.0.1:9000")
    raw = raw.replace("https://", "").replace("http://", "").rstrip("/")
    return raw


def _access_key() -> str:
    return _env_or_default("MINIO_ACCESS_KEY", "") or _env_or_default("MINIO_ROOT_USER", "minioadmin")


def _secret_key() -> str:
    return _env_or_default("MINIO_SECRET_KEY", "") or _env_or_default("MINIO_ROOT_PASSWORD", "minioadmin")


def _secure() -> bool:
    return _env_or_default("MINIO_SECURE", "false").lower() in ("1", "true", "yes")


def bucket_name() -> str:
    return _env_or_default("MINIO_BUCKET", "myimage")


def get_client() -> Minio:
    return Minio(
        _endpoint_host_port(),
        access_key=_access_key(),
        secret_key=_secret_key(),
        secure=_secure(),
    )


def _is_safe_key_prefix(key: str, prefix: str) -> bool:
    if not key.startswith(prefix):
        return False
    if ".." in key or key.startswith("/") or "\\" in key:
        return False
    return True


def is_safe_characters_key(key: str) -> bool:
    return _is_safe_key_prefix(key, "characters/")


def is_safe_temp_illustration_key(key: str) -> bool:
    return _is_safe_key_prefix(key, "temp-illustrations/")


def is_safe_prompt_preview_key(key: str) -> bool:
    return _is_safe_key_prefix(key, "prompt-previews/")


def is_safe_object_key(key: str) -> bool:
    return (
        is_safe_characters_key(key)
        or is_safe_temp_illustration_key(key)
        or is_safe_prompt_preview_key(key)
    )


def remove_object(object_key: str) -> None:
    """删除允许前缀下的对象；键不合法或对象不存在时忽略。"""
    if not is_safe_object_key(object_key):
        return
    try:
        client = get_client()
        client.remove_object(bucket_name(), object_key)
    except S3Error as e:
        if getattr(e, "code", "") != "NoSuchKey":
            logger.warning("MinIO remove_object %s: %s", object_key, e)


def remove_characters_object(object_key: str) -> None:
    """删除 `characters/` 下对象；键不合法或对象不存在时忽略。"""
    if not is_safe_characters_key(object_key):
        return
    remove_object(object_key)


def get_object_bytes(object_key: str) -> tuple[bytes, str]:
    """
    读取对象内容与 content_type。
    返回 (raw, content_type)。键不合法或不存在时抛 HTTPException。
    """
    if not is_safe_object_key(object_key):
        raise HTTPException(400, "非法对象键")
    try:
        client = get_client()
        b = bucket_name()
        stat = client.stat_object(b, object_key)
        resp = client.get_object(b, object_key)
        try:
            raw = resp.read()
        finally:
            resp.close()
            resp.release_conn()
    except S3Error as e:
        code = getattr(e, "code", "") or ""
        if code in ("NoSuchKey", "NoSuchObject"):
            raise HTTPException(404, "对象不存在") from e
        logger.exception("MinIO get_object failed")
        raise HTTPException(502, f"对象存储读取失败: {e}") from e
    ct = (getattr(stat, "content_type", None) or "application/octet-stream").split(";")[0].strip().lower()
    return raw, ct


def encode_image_to_jpeg(
    raw: bytes,
    *,
    quality: int = 85,
    max_edge: int = 2000,
) -> bytes:
    """
    任意位图 → JPEG 字节（RGB，白底铺透明）。
    quality: 1–95；max_edge≤0 表示不缩放。
    """
    q = max(1, min(95, int(quality)))
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("无法识别为图片") from e

    if im.format and str(im.format).upper() == "SVG":
        raise ValueError("不支持将 SVG 转为 JPEG")

    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    if max_edge and max_edge > 0:
        w, h = im.size
        edge = max(w, h)
        if edge > max_edge:
            scale = max_edge / edge
            nw = max(1, round(w * scale))
            nh = max(1, round(h * scale))
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS  # type: ignore[attr-defined]
            im = im.resize((nw, nh), resample)

    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=q, optimize=True)
    return buf.getvalue()


def ensure_bucket() -> None:
    try:
        client = get_client()
        b = bucket_name()
        if not client.bucket_exists(b):
            client.make_bucket(b)
            logger.info("MinIO: created bucket %s", b)
    except Exception as e:
        logger.warning("MinIO: ensure_bucket skipped or failed: %s", e)


def _ext_for_content_type(ct: str | None) -> str:
    if not ct:
        return ".bin"
    m = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
    }
    return m.get(ct.split(";")[0].strip().lower(), ".bin")


def _normalize_image_content_type(content_type: str | None) -> str:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(400, "请上传图片文件")
    return content_type.split(";")[0].strip().lower()


def _validate_image_bytes(raw: bytes, content_type: str) -> None:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件过大（上限 {MAX_UPLOAD_BYTES // 1024 // 1024} MB）")
    if content_type == "image/svg+xml":
        return
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        im.close()
    except (UnidentifiedImageError, OSError) as e:
        raise HTTPException(400, "无法识别为图片") from e


def put_image_bytes(prefix: str, raw: bytes, content_type: str | None) -> str:
    """
    Validate image bytes and put under `{prefix}{uuid}{ext}`.
    `prefix` must be one of the managed image prefixes (with trailing slash).
    Returns the object key. Raises HTTPException on validation / storage failure.
    """
    if prefix not in ("characters/", "temp-illustrations/", "prompt-previews/"):
        raise HTTPException(500, f"未知上传前缀: {prefix}")
    ct = _normalize_image_content_type(content_type)
    _validate_image_bytes(raw, ct)
    key = f"{prefix}{uuid.uuid4().hex}{_ext_for_content_type(ct)}"
    try:
        client = get_client()
        client.put_object(
            bucket_name(),
            key,
            io.BytesIO(raw),
            length=len(raw),
            content_type=ct or "application/octet-stream",
        )
    except S3Error as e:
        logger.exception("MinIO put_object failed")
        raise HTTPException(502, f"对象存储写入失败: {e}") from e
    return key


async def _upload_image_under_prefix(prefix: str, file: UploadFile) -> dict[str, str]:
    raw = await file.read()
    key = put_image_bytes(prefix, raw, file.content_type)
    return {"object_key": key}


@router.post("/upload-character-image")
async def upload_character_image(file: UploadFile = File(...)):
    return await _upload_image_under_prefix("characters/", file)


@router.post("/upload-temp-illustration-image")
async def upload_temp_illustration_image(file: UploadFile = File(...)):
    return await _upload_image_under_prefix("temp-illustrations/", file)


@router.post("/upload-prompt-preview-image")
async def upload_prompt_preview_image(file: UploadFile = File(...)):
    """词库提示词效果参考图（键由词库条目 preview_image_key 引用）。"""
    return await _upload_image_under_prefix("prompt-previews/", file)


@router.get("/presign-get")
def presign_get(object_key: str = Query(..., alias="object_key")):
    if not is_safe_object_key(object_key):
        raise HTTPException(400, "非法对象键")

    try:
        client = get_client()
        b = bucket_name()
        url = client.presigned_get_object(
            b,
            object_key,
            expires=timedelta(hours=PRESIGN_GET_HOURS),
        )
    except S3Error as e:
        logger.exception("MinIO presign_get failed")
        raise HTTPException(502, f"无法生成访问链接: {e}") from e

    return {
        "url": url,
        "expires_seconds": int(timedelta(hours=PRESIGN_GET_HOURS).total_seconds()),
    }


@router.delete("/object")
def delete_object_route(object_key: str = Query(..., alias="object_key")):
    if not is_safe_object_key(object_key):
        raise HTTPException(400, "非法对象键")
    remove_object(object_key)
    return {"ok": True}
