"""临时插画 CRUD：SQLite 元数据 + MinIO 图片。"""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

import temp_illustration_store as store
from storage_minio import is_safe_temp_illustration_key, put_image_bytes, remove_object

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/temp-illustrations", tags=["temp-illustrations"])


class TempIllustrationCreate(BaseModel):
    id: str | None = Field(None, description="可选；不传则服务端生成 UUID")
    title: str = Field(..., min_length=1, max_length=500)
    mime_type: str = Field(..., min_length=1, max_length=128)
    sd_raw: str | None = Field(None, max_length=256000)
    image_key: str = Field(..., min_length=1, max_length=1024)
    content_sha256: str = Field(..., min_length=64, max_length=64)


class TempIllustrationOut(BaseModel):
    id: str
    title: str
    mime_type: str
    sd_raw: str | None
    image_key: str
    content_sha256: str
    created_at: int


class DuplicateCheckOut(BaseModel):
    duplicate: bool
    existing: TempIllustrationOut | None = None


class TempIllustrationUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    sd_raw: str | None = Field(None, max_length=256000)
    clear_sd_raw: bool = False


def _validate_image_key(key: str) -> None:
    if not is_safe_temp_illustration_key(key):
        raise HTTPException(400, "image_key 须为 temp-illustrations/ 前缀的合法对象键")


def _row_to_out(row: dict[str, str | int | None]) -> TempIllustrationOut:
    return TempIllustrationOut(
        id=str(row["id"]),
        title=str(row["title"]),
        mime_type=str(row["mime_type"]),
        sd_raw=str(row["sd_raw"]) if row.get("sd_raw") is not None else None,
        image_key=str(row["image_key"]),
        content_sha256=str(row["content_sha256"]),
        created_at=int(row["created_at"]),
    )


@router.get("", response_model=list[TempIllustrationOut])
def list_temp_illustrations():
    return [_row_to_out(r) for r in store.list_entries()]


@router.get("/check-duplicate", response_model=DuplicateCheckOut)
def check_duplicate(
    content_sha256: str = Query(..., min_length=64, max_length=64),
    mime_type: str = Query(..., min_length=1, max_length=128),
    sd_raw: str | None = Query(None),
):
    row = store.find_duplicate(content_sha256.strip().lower(), mime_type, sd_raw)
    if row is None:
        return DuplicateCheckOut(duplicate=False, existing=None)
    return DuplicateCheckOut(duplicate=True, existing=_row_to_out(row))


@router.post("", response_model=TempIllustrationOut)
def create_temp_illustration(body: TempIllustrationCreate):
    """仅写入元数据（对象须已存在）。新上传请用 `/with-image`，避免入库失败留下孤立对象。"""
    _validate_image_key(body.image_key)
    eid = (body.id or "").strip() or store.new_id()
    sd = body.sd_raw.strip() if body.sd_raw and body.sd_raw.strip() else None
    try:
        row = store.insert_entry(
            eid,
            body.title.strip(),
            body.mime_type.strip(),
            sd,
            body.image_key.strip(),
            body.content_sha256.strip().lower(),
        )
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return _row_to_out(row)


@router.post("/with-image", response_model=TempIllustrationOut)
async def create_temp_illustration_with_image(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=500),
    mime_type: str | None = Form(None, max_length=128),
    sd_raw: str | None = Form(None, max_length=256000),
    id: str | None = Form(None),
):
    """上传图片并写入条目；入库失败时删除刚写入的 MinIO 对象。"""
    raw = await file.read()
    ct = (mime_type or file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    if not ct:
        ct = "application/octet-stream"
    key = put_image_bytes("temp-illustrations/", raw, file.content_type or ct)
    eid = (id or "").strip() or store.new_id()
    sd = sd_raw.strip() if sd_raw and sd_raw.strip() else None
    sha = hashlib.sha256(raw).hexdigest()
    try:
        row = store.insert_entry(eid, title.strip(), ct, sd, key, sha)
    except ValueError as e:
        remove_object(key)
        raise HTTPException(409, str(e)) from e
    except Exception:
        remove_object(key)
        logger.exception("temp illustration insert failed after MinIO put; rolled back object %s", key)
        raise
    return _row_to_out(row)


@router.patch("/{entry_id}", response_model=TempIllustrationOut)
def update_temp_illustration(entry_id: str, body: TempIllustrationUpdate):
    if body.title is None and body.sd_raw is None and not body.clear_sd_raw:
        raise HTTPException(400, "请提供要更新的字段")
    row = store.update_entry(
        entry_id,
        title=body.title.strip() if body.title is not None else None,
        sd_raw=body.sd_raw,
        clear_sd_raw=body.clear_sd_raw,
    )
    if row is None:
        raise HTTPException(404, "条目不存在")
    return _row_to_out(row)


@router.delete("/all")
def delete_all_temp_illustrations():
    """删除全部临时插画（SQLite + MinIO）。须注册在 /{entry_id} 之前。"""
    keys = store.delete_all_entries()
    for key in keys:
        remove_object(key)
    return {"ok": True, "deleted": len(keys)}


@router.delete("/{entry_id}")
def delete_temp_illustration(entry_id: str):
    old = store.get_entry(entry_id)
    if old is None:
        raise HTTPException(404, "条目不存在")
    image_key = str(old["image_key"])
    store.delete_entry(entry_id)
    remove_object(image_key)
    return {"ok": True}
