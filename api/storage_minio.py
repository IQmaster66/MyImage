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


def is_safe_characters_key(key: str) -> bool:
    if not key.startswith("characters/"):
        return False
    if ".." in key or key.startswith("/") or "\\" in key:
        return False
    return True


def remove_characters_object(object_key: str) -> None:
    """删除 `characters/` 下对象；键不合法或对象不存在时忽略。"""
    if not is_safe_characters_key(object_key):
        return
    try:
        client = get_client()
        client.remove_object(bucket_name(), object_key)
    except S3Error as e:
        if getattr(e, "code", "") != "NoSuchKey":
            logger.warning("MinIO remove_characters_object %s: %s", object_key, e)


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


@router.post("/upload-character-image")
async def upload_character_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "请上传图片文件")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件过大（上限 {MAX_UPLOAD_BYTES // 1024 // 1024} MB）")

    ct = file.content_type.split(";")[0].strip().lower()
    if ct != "image/svg+xml":
        try:
            im = Image.open(io.BytesIO(raw))
            im.load()
            im.close()
        except (UnidentifiedImageError, OSError) as e:
            raise HTTPException(400, "无法识别为图片") from e

    ext = _ext_for_content_type(file.content_type)
    key = f"characters/{uuid.uuid4().hex}{ext}"

    try:
        client = get_client()
        b = bucket_name()
        client.put_object(b, key, io.BytesIO(raw), length=len(raw), content_type=ct or "application/octet-stream")
    except S3Error as e:
        logger.exception("MinIO put_object failed")
        raise HTTPException(502, f"对象存储写入失败: {e}") from e

    return {"object_key": key}


@router.get("/presign-get")
def presign_get(object_key: str = Query(..., alias="object_key")):
    if not is_safe_characters_key(object_key):
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
def delete_object(object_key: str = Query(..., alias="object_key")):
    if not is_safe_characters_key(object_key):
        raise HTTPException(400, "非法对象键")

    try:
        client = get_client()
        b = bucket_name()
        client.remove_object(b, object_key)
    except S3Error as e:
        if getattr(e, "code", "") == "NoSuchKey":
            return {"ok": True, "note": "对象已不存在"}
        logger.exception("MinIO remove_object failed")
        raise HTTPException(502, f"删除失败: {e}") from e

    return {"ok": True}
