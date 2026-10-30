"""后台管理：MinIO 存储统计与孤立对象清理。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import character_store as character_store
import prompt_library_store as prompt_store
import temp_illustration_store as temp_store
from storage_minio import bucket_name, get_client, is_safe_object_key, remove_object

router = APIRouter(prefix="/admin", tags=["admin"])

_MANAGED_PREFIXES = ("characters/", "temp-illustrations/", "prompt-previews/")


def _list_managed_object_keys() -> list[tuple[str, int]]:
    client = get_client()
    b = bucket_name()
    rows: list[tuple[str, int]] = []
    for prefix in _MANAGED_PREFIXES:
        for obj in client.list_objects(b, prefix=prefix, recursive=True):
            name = getattr(obj, "object_name", None) or getattr(obj, "key", "")
            if not name or not is_safe_object_key(name):
                continue
            size = int(getattr(obj, "size", 0) or 0)
            rows.append((name, size))
    return rows


def _referenced_keys() -> set[str]:
    """Collect MinIO keys still referenced by SQLite stores (must cover all managed prefixes)."""
    keys: set[str] = set()
    for row in character_store.list_characters():
        k = str(row.get("image_key") or "").strip()
        if k:
            keys.add(k)
    for row in temp_store.list_entries():
        k = str(row.get("image_key") or "").strip()
        if k:
            keys.add(k)
    for row in prompt_store.list_entries():
        k = str(row.get("preview_image_key") or "").strip()
        if k:
            keys.add(k)
    return keys


class PrefixStats(BaseModel):
    prefix: str
    count: int
    bytes: int


class ObjectSize(BaseModel):
    object_key: str
    size: int


class StorageStatsOut(BaseModel):
    bucket: str
    total_count: int
    total_bytes: int
    by_prefix: list[PrefixStats]
    db_referenced_count: int
    # 各对象体积，供后台卡片展示
    objects: list[ObjectSize] = []


class OrphanObject(BaseModel):
    object_key: str
    size: int


class OrphanListOut(BaseModel):
    orphans: list[OrphanObject]
    total_bytes: int


class OrphanDeleteBody(BaseModel):
    object_keys: list[str] = Field(..., min_length=1, max_length=500)


@router.get("/storage-stats", response_model=StorageStatsOut)
def storage_stats():
    try:
        objects = _list_managed_object_keys()
    except Exception as e:
        raise HTTPException(502, f"无法读取 MinIO 对象列表: {e}") from e

    by_prefix_map: dict[str, PrefixStats] = {}
    total_bytes = 0
    for key, size in objects:
        total_bytes += size
        prefix = next((p for p in _MANAGED_PREFIXES if key.startswith(p)), "other/")
        if prefix not in by_prefix_map:
            by_prefix_map[prefix] = PrefixStats(prefix=prefix, count=0, bytes=0)
        p = by_prefix_map[prefix]
        by_prefix_map[prefix] = PrefixStats(prefix=p.prefix, count=p.count + 1, bytes=p.bytes + size)

    referenced = _referenced_keys()
    return StorageStatsOut(
        bucket=bucket_name(),
        total_count=len(objects),
        total_bytes=total_bytes,
        by_prefix=list(by_prefix_map.values()),
        db_referenced_count=len(referenced),
        objects=[ObjectSize(object_key=k, size=s) for k, s in objects],
    )


@router.get("/orphan-objects", response_model=OrphanListOut)
def list_orphan_objects():
    try:
        objects = _list_managed_object_keys()
    except Exception as e:
        raise HTTPException(502, f"无法读取 MinIO 对象列表: {e}") from e

    referenced = _referenced_keys()
    orphans: list[OrphanObject] = []
    total_bytes = 0
    for key, size in objects:
        if key in referenced:
            continue
        orphans.append(OrphanObject(object_key=key, size=size))
        total_bytes += size
    orphans.sort(key=lambda o: o.object_key)
    return OrphanListOut(orphans=orphans, total_bytes=total_bytes)


@router.post("/orphan-objects/delete")
def delete_orphan_objects(body: OrphanDeleteBody):
    referenced = _referenced_keys()
    deleted = 0
    for key in body.object_keys:
        k = key.strip()
        if not is_safe_object_key(k):
            raise HTTPException(400, f"非法对象键: {k}")
        if k in referenced:
            raise HTTPException(400, f"对象仍被数据库引用，无法作为孤立对象删除: {k}")
        remove_object(k)
        deleted += 1
    return {"ok": True, "deleted": deleted}
