"""提示词词库 CRUD：SQLite。"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import prompt_library_store as store
from storage_minio import is_safe_prompt_preview_key, remove_object

router = APIRouter(prefix="/prompt-library", tags=["prompt-library"])


class CategoryOut(BaseModel):
    id: str
    name: str
    parent_id: str = ""
    sort_order: int
    created_at: int
    updated_at: int


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    parent_id: str = Field("", max_length=64)


class CategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    parent_id: str = Field("", max_length=64)
    sort_order: int = 0
    created_at: int | None = None
    updated_at: int | None = None


class EntryOut(BaseModel):
    id: str
    title: str
    body: str
    kind: str
    category_id: str = ""
    tags: list[str] = Field(default_factory=list)
    favorited: bool = False
    preview_image_key: str | None = None
    created_at: int
    updated_at: int


class EntryUpsert(BaseModel):
    id: str | None = None
    title: str = Field(..., min_length=1, max_length=500)
    body: str = Field("", max_length=200_000)
    kind: str = Field("positive", max_length=32)
    category_id: str = Field("", max_length=64)
    tags: list[str] = Field(default_factory=list)
    favorited: bool = False
    preview_image_key: str | None = Field(None, max_length=1024)
    created_at: int | None = None
    updated_at: int | None = None


class ImportBody(BaseModel):
    version: int | None = None
    categories: list[dict] = Field(default_factory=list)
    entries: list[dict] = Field(default_factory=list)
    skip_existing_ids: bool = True


class ImportResult(BaseModel):
    added: int
    skipped: int


class ExportOut(BaseModel):
    version: int
    categories: list[dict]
    entries: list[dict]


def _validate_preview_key(key: str | None) -> None:
    if key is None or not str(key).strip():
        return
    if not is_safe_prompt_preview_key(str(key).strip()):
        raise HTTPException(400, "preview_image_key 须为 prompt-previews/ 前缀的合法对象键")


@router.get("/categories", response_model=list[CategoryOut])
def list_categories():
    return store.list_categories()


@router.post("/categories", response_model=CategoryOut)
def create_category(body: CategoryCreate):
    try:
        return store.create_category(body.name.strip(), body.parent_id.strip())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: str, body: CategoryUpdate):
    old = store.get_category(category_id)
    if old is None:
        raise HTTPException(404, "分类不存在")
    return store.upsert_category(
        category_id,
        body.name.strip(),
        body.parent_id.strip(),
        body.sort_order,
        body.created_at if body.created_at is not None else int(old["created_at"]),
        body.updated_at,
    )


@router.delete("/categories/{category_id}")
def delete_category(category_id: str):
    if store.get_category(category_id) is None:
        raise HTTPException(404, "分类不存在")
    store.delete_category(category_id)
    return {"ok": True}


@router.get("/entries", response_model=list[EntryOut])
def list_entries():
    return store.list_entries()


@router.post("/entries", response_model=EntryOut)
def create_entry(body: EntryUpsert):
    _validate_preview_key(body.preview_image_key)
    eid = (body.id or "").strip() or uuid.uuid4().hex
    return store.upsert_entry(
        eid,
        body.title,
        body.body,
        body.kind,
        body.category_id,
        body.tags,
        body.favorited,
        (body.preview_image_key or "").strip() or None,
        body.created_at,
        body.updated_at,
    )


@router.put("/entries/{entry_id}", response_model=EntryOut)
def update_entry(entry_id: str, body: EntryUpsert):
    _validate_preview_key(body.preview_image_key)
    if store.get_entry(entry_id) is None:
        raise HTTPException(404, "片段不存在")
    return store.upsert_entry(
        entry_id,
        body.title,
        body.body,
        body.kind,
        body.category_id,
        body.tags,
        body.favorited,
        (body.preview_image_key or "").strip() or None,
        body.created_at,
        body.updated_at,
    )


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str):
    old = store.delete_entry(entry_id)
    if old is None:
        raise HTTPException(404, "片段不存在")
    key = old.get("preview_image_key")
    if key and is_safe_prompt_preview_key(str(key)):
        remove_object(str(key))
    return {"ok": True}


@router.post("/import", response_model=ImportResult)
def import_bundle(body: ImportBody):
    added, skipped = store.import_bundle(
        body.categories,
        body.entries,
        skip_existing_ids=body.skip_existing_ids,
    )
    return ImportResult(added=added, skipped=skipped)


@router.get("/export", response_model=ExportOut)
def export_bundle():
    data = store.export_bundle()
    return ExportOut(**data)
