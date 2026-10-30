"""人物百科 CRUD：SQLite + MinIO 图片清理；出自来源侧栏。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import character_store as store
from storage_minio import (
    encode_image_to_jpeg,
    get_object_bytes,
    is_safe_characters_key,
    put_image_bytes,
    remove_characters_object,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/characters", tags=["characters"])


class SourceOut(BaseModel):
    id: str
    name: str
    parent_id: str = ""
    sort_order: int
    created_at: int
    updated_at: int


class SourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    parent_id: str = Field("", max_length=64)


class SourceUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    parent_id: str = Field("", max_length=64)
    sort_order: int = 0
    created_at: int | None = None
    updated_at: int | None = None


class CharacterCreate(BaseModel):
    id: str | None = Field(None, description="可选；不传则服务端生成 UUID")
    name: str = Field("", max_length=500, description="可为空（工具箱快捷入库等）")
    prompt_clothed: str = Field("", max_length=64000, description="带服装提示词")
    prompt_unclothed: str = Field("", max_length=64000, description="不带服装提示词")
    prompt: str | None = Field(None, max_length=64000, description="兼容旧字段；未传 prompt_clothed 时回退")
    source_id: str = Field("", max_length=64, description="出自来源 id；空=未归类")
    image_key: str = Field(..., min_length=1, max_length=1024)


class CharacterUpdate(BaseModel):
    name: str = Field("", max_length=500)
    prompt_clothed: str = Field("", max_length=64000)
    prompt_unclothed: str = Field("", max_length=64000)
    prompt: str | None = Field(None, max_length=64000)
    source_id: str = Field("", max_length=64)
    image_key: str = Field(..., min_length=1, max_length=1024)


class CharacterOut(BaseModel):
    id: str
    name: str
    prompt: str
    prompt_clothed: str
    prompt_unclothed: str
    source_id: str = ""
    image_key: str
    created_at: int
    updated_at: int


class ReencodeImagesBody(BaseModel):
    """批量将人物配图转为 JPEG 以节省 MinIO 空间。"""

    quality: int = Field(85, ge=40, le=95, description="JPEG 质量")
    max_edge: int = Field(2000, ge=0, le=8192, description="最长边上限；0=不缩放")
    skip_already_jpeg: bool = Field(
        False,
        description="为 true 时跳过已是 .jpg/.jpeg 的对象（仅转换 PNG/WebP 等）",
    )
    force: bool = Field(
        False,
        description="为 true 时即便重编码后体积更大也替换；默认仅在体积变小或原非 JPEG 时替换",
    )


class ReencodeImagesItemOut(BaseModel):
    id: str
    name: str
    status: str
    detail: str = ""
    bytes_before: int = 0
    bytes_after: int = 0
    image_key: str = ""


class ReencodeImagesOut(BaseModel):
    total: int
    converted: int
    skipped: int
    failed: int
    bytes_before: int
    bytes_after: int
    items: list[ReencodeImagesItemOut]


def _validate_image_key(key: str) -> None:
    if not is_safe_characters_key(key):
        raise HTTPException(400, "image_key 须为 characters/ 前缀的合法对象键")


def _clothed_from_body(body: CharacterCreate | CharacterUpdate) -> str:
    clothed = (body.prompt_clothed or "").strip()
    if clothed:
        return clothed
    if body.prompt is not None:
        return body.prompt.strip()
    return ""


@router.get("/sources", response_model=list[SourceOut])
def list_sources():
    return store.list_sources()


@router.post("/sources", response_model=SourceOut)
def create_source(body: SourceCreate):
    try:
        return store.create_source(body.name.strip(), body.parent_id.strip())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/sources/{source_id}", response_model=SourceOut)
def update_source(source_id: str, body: SourceUpdate):
    old = store.get_source(source_id)
    if old is None:
        raise HTTPException(404, "来源不存在")
    return store.upsert_source(
        source_id,
        body.name.strip(),
        body.parent_id.strip(),
        body.sort_order,
        body.created_at if body.created_at is not None else int(old["created_at"]),
        body.updated_at,
    )


@router.delete("/sources/{source_id}")
def delete_source(source_id: str):
    if store.get_source(source_id) is None:
        raise HTTPException(404, "来源不存在")
    store.delete_source(source_id)
    return {"ok": True}


@router.get("", response_model=list[CharacterOut])
def list_characters():
    return store.list_characters()


@router.post("", response_model=CharacterOut)
def create_character(body: CharacterCreate):
    _validate_image_key(body.image_key)
    cid = (body.id or "").strip() or store.new_id()
    try:
        return store.insert_character(
            cid,
            body.name.strip(),
            _clothed_from_body(body),
            (body.prompt_unclothed or "").strip(),
            body.image_key.strip(),
            (body.source_id or "").strip(),
        )
    except ValueError as e:
        msg = str(e)
        raise HTTPException(409 if "已存在" in msg else 400, msg) from e


@router.put("/{character_id}", response_model=CharacterOut)
def update_character(character_id: str, body: CharacterUpdate):
    _validate_image_key(body.image_key)
    old = store.get_character(character_id)
    if old is None:
        raise HTTPException(404, "人物不存在")
    prev_key = str(old["image_key"])
    new_key = body.image_key.strip()
    try:
        row = store.update_character(
            character_id,
            body.name.strip(),
            _clothed_from_body(body),
            (body.prompt_unclothed or "").strip(),
            new_key,
            (body.source_id or "").strip(),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if row is None:
        raise HTTPException(404, "人物不存在")
    if prev_key != new_key:
        remove_characters_object(prev_key)
    return row


@router.post("/reencode-images", response_model=ReencodeImagesOut)
def reencode_character_images(body: ReencodeImagesBody):
    """
    将全部人物配图转为 JPEG（白底、去元数据），写回 MinIO 并更新 image_key，删除旧对象。
    须注册在 /{character_id} 之前。
    """
    rows = store.list_characters()
    items: list[ReencodeImagesItemOut] = []
    converted = skipped = failed = 0
    sum_before = sum_after = 0

    for row in rows:
        cid = str(row["id"])
        name = str(row.get("name") or "")
        key = str(row.get("image_key") or "").strip()
        if not key:
            skipped += 1
            items.append(
                ReencodeImagesItemOut(id=cid, name=name, status="skipped", detail="无配图"),
            )
            continue
        if not is_safe_characters_key(key):
            failed += 1
            items.append(
                ReencodeImagesItemOut(id=cid, name=name, status="failed", detail="非法 image_key"),
            )
            continue

        key_l = key.lower()
        looks_jpeg = key_l.endswith(".jpg") or key_l.endswith(".jpeg")
        if body.skip_already_jpeg and looks_jpeg:
            skipped += 1
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="skipped",
                    detail="已是 JPEG",
                    image_key=key,
                ),
            )
            continue
        if key_l.endswith(".svg"):
            skipped += 1
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="skipped",
                    detail="跳过 SVG",
                    image_key=key,
                ),
            )
            continue

        try:
            raw, ct = get_object_bytes(key)
        except HTTPException as e:
            failed += 1
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="failed",
                    detail=str(e.detail),
                    image_key=key,
                ),
            )
            continue

        before = len(raw)
        was_jpeg = looks_jpeg or ct in ("image/jpeg", "image/jpg")
        try:
            jpeg_raw = encode_image_to_jpeg(raw, quality=body.quality, max_edge=body.max_edge)
        except ValueError as e:
            failed += 1
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="failed",
                    detail=str(e),
                    bytes_before=before,
                    image_key=key,
                ),
            )
            continue

        after = len(jpeg_raw)
        if was_jpeg and after >= before and not body.force:
            skipped += 1
            sum_before += before
            sum_after += before
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="skipped",
                    detail="重编码未缩小，保留原图",
                    bytes_before=before,
                    bytes_after=before,
                    image_key=key,
                ),
            )
            continue

        try:
            new_key = put_image_bytes("characters/", jpeg_raw, "image/jpeg")
            updated = store.update_character(
                cid,
                name,
                str(row.get("prompt_clothed") or row.get("prompt") or ""),
                str(row.get("prompt_unclothed") or ""),
                new_key,
                str(row.get("source_id") or ""),
            )
            if updated is None:
                remove_characters_object(new_key)
                raise RuntimeError("更新数据库失败")
            if new_key != key:
                remove_characters_object(key)
        except Exception as e:
            logger.exception("reencode character %s failed", cid)
            failed += 1
            items.append(
                ReencodeImagesItemOut(
                    id=cid,
                    name=name,
                    status="failed",
                    detail=str(e),
                    bytes_before=before,
                    bytes_after=after,
                    image_key=key,
                ),
            )
            continue

        converted += 1
        sum_before += before
        sum_after += after
        items.append(
            ReencodeImagesItemOut(
                id=cid,
                name=name,
                status="converted",
                detail=f"{before} → {after}",
                bytes_before=before,
                bytes_after=after,
                image_key=new_key,
            ),
        )

    return ReencodeImagesOut(
        total=len(rows),
        converted=converted,
        skipped=skipped,
        failed=failed,
        bytes_before=sum_before,
        bytes_after=sum_after,
        items=items,
    )


@router.delete("/all")
def delete_all_characters():
    """删除全部人物（SQLite + MinIO）。须注册在 /{character_id} 之前。"""
    keys = store.delete_all_characters()
    for key in keys:
        remove_characters_object(key)
    return {"ok": True, "deleted": len(keys)}


@router.delete("/{character_id}")
def delete_character(character_id: str):
    old = store.get_character(character_id)
    if old is None:
        raise HTTPException(404, "人物不存在")
    image_key = str(old["image_key"])
    store.delete_character(character_id)
    remove_characters_object(image_key)
    return {"ok": True}
