"""人物百科 CRUD：SQLite + MinIO 图片清理。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import character_store as store
from storage_minio import is_safe_characters_key, remove_characters_object

router = APIRouter(prefix="/characters", tags=["characters"])


class CharacterCreate(BaseModel):
    id: str | None = Field(None, description="可选；不传则服务端生成 UUID")
    name: str = Field(..., min_length=1, max_length=500)
    prompt: str = Field("", max_length=64000)
    image_key: str = Field(..., min_length=1, max_length=1024)


class CharacterUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    prompt: str = Field("", max_length=64000)
    image_key: str = Field(..., min_length=1, max_length=1024)


class CharacterOut(BaseModel):
    id: str
    name: str
    prompt: str
    image_key: str
    created_at: int
    updated_at: int


def _validate_image_key(key: str) -> None:
    if not is_safe_characters_key(key):
        raise HTTPException(400, "image_key 须为 characters/ 前缀的合法对象键")


@router.get("", response_model=list[CharacterOut])
def list_characters():
    return store.list_characters()


@router.post("", response_model=CharacterOut)
def create_character(body: CharacterCreate):
    _validate_image_key(body.image_key)
    cid = (body.id or "").strip() or store.new_id()
    try:
        return store.insert_character(cid, body.name.strip(), body.prompt.strip(), body.image_key.strip())
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


@router.put("/{character_id}", response_model=CharacterOut)
def update_character(character_id: str, body: CharacterUpdate):
    _validate_image_key(body.image_key)
    old = store.get_character(character_id)
    if old is None:
        raise HTTPException(404, "人物不存在")
    prev_key = str(old["image_key"])
    new_key = body.image_key.strip()
    row = store.update_character(
        character_id,
        body.name.strip(),
        body.prompt.strip(),
        new_key,
    )
    if row is None:
        raise HTTPException(404, "人物不存在")
    if prev_key != new_key:
        remove_characters_object(prev_key)
    return row


@router.delete("/{character_id}")
def delete_character(character_id: str):
    old = store.get_character(character_id)
    if old is None:
        raise HTTPException(404, "人物不存在")
    image_key = str(old["image_key"])
    store.delete_character(character_id)
    remove_characters_object(image_key)
    return {"ok": True}
