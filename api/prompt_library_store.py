"""提示词词库：SQLite（分类 + 片段元数据；效果图键存 MinIO prompt-previews/）。"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

_API_DIR = Path(__file__).resolve().parent

MAX_CATEGORY_DEPTH = 3
ROOT_PARENT_ID = ""

DEFAULT_CATEGORY_NAMES = [
    "人物外貌",
    "服装配饰",
    "姿态动作",
    "场景环境",
    "光影构图",
    "画风质量",
    "负面词",
]


def db_path() -> Path:
    raw = os.getenv("PROMPT_LIBRARY_DB_PATH", "").strip().strip('"').strip("'")
    if raw:
        return Path(raw)
    return _API_DIR / "data" / "prompt_library.db"


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _now_ms() -> int:
    return int(time.time() * 1000)


def init_db() -> None:
    conn = connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prompt_categories (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                parent_id TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prompt_categories_parent ON prompt_categories (parent_id);"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prompt_entries (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                kind TEXT NOT NULL,
                category_id TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                favorited INTEGER NOT NULL DEFAULT 0,
                preview_image_key TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prompt_entries_updated ON prompt_entries (updated_at);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_prompt_entries_category ON prompt_entries (category_id);"
        )
        conn.commit()
        _seed_default_categories(conn)
    finally:
        conn.close()


def _seed_default_categories(conn: sqlite3.Connection) -> None:
    cur = conn.execute("SELECT COUNT(*) AS n FROM prompt_categories;")
    if int(cur.fetchone()["n"]) > 0:
        return
    now = _now_ms()
    for i, name in enumerate(DEFAULT_CATEGORY_NAMES):
        conn.execute(
            """
            INSERT INTO prompt_categories (id, name, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (uuid.uuid4().hex, name, ROOT_PARENT_ID, i, now, now),
        )
    conn.commit()


def list_categories() -> list[dict[str, Any]]:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, name, parent_id, sort_order, created_at, updated_at
            FROM prompt_categories
            ORDER BY sort_order ASC, name ASC;
            """
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _category_depth(categories: list[dict[str, Any]], cat_id: str) -> int:
    by_id = {str(c["id"]): c for c in categories}
    depth = 0
    cur = cat_id
    seen: set[str] = set()
    while cur and cur in by_id:
        if cur in seen:
            break
        seen.add(cur)
        depth += 1
        cur = str(by_id[cur].get("parent_id") or "")
    return depth


def _descendant_ids(categories: list[dict[str, Any]], root_id: str) -> list[str]:
    children: dict[str, list[str]] = {}
    for c in categories:
        p = str(c.get("parent_id") or "")
        children.setdefault(p, []).append(str(c["id"]))
    out: list[str] = []
    stack = [root_id]
    while stack:
        cid = stack.pop()
        out.append(cid)
        stack.extend(children.get(cid, []))
    return out


def upsert_category(
    cat_id: str,
    name: str,
    parent_id: str,
    sort_order: int,
    created_at: int | None = None,
    updated_at: int | None = None,
) -> dict[str, Any]:
    now = _now_ms()
    ca = created_at if created_at is not None else now
    ua = updated_at if updated_at is not None else now
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO prompt_categories (id, name, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                parent_id = excluded.parent_id,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at;
            """,
            (cat_id, name.strip() or "未命名分类", parent_id or "", sort_order, ca, ua),
        )
        conn.commit()
    finally:
        conn.close()
    row = get_category(cat_id)
    assert row is not None
    return row


def get_category(cat_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, name, parent_id, sort_order, created_at, updated_at
            FROM prompt_categories WHERE id = ?;
            """,
            (cat_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_category(name: str, parent_id: str = ROOT_PARENT_ID) -> dict[str, Any]:
    categories = list_categories()
    parent = (parent_id or "").strip()
    if parent:
        if not any(str(c["id"]) == parent for c in categories):
            raise ValueError("父分类不存在")
        depth = _category_depth(categories, parent) + 1
        if depth > MAX_CATEGORY_DEPTH:
            raise ValueError(f"最多支持 {MAX_CATEGORY_DEPTH} 级分类")
    siblings = [c for c in categories if str(c.get("parent_id") or "") == parent]
    max_order = max((int(c["sort_order"]) for c in siblings), default=-1)
    cid = uuid.uuid4().hex
    return upsert_category(cid, name, parent, max_order + 1)


def delete_category(category_id: str) -> None:
    if not category_id:
        return
    categories = list_categories()
    ids = set(_descendant_ids(categories, category_id))
    conn = connect()
    try:
        now = _now_ms()
        for cid in ids:
            conn.execute("DELETE FROM prompt_categories WHERE id = ?;", (cid,))
        placeholders = ",".join("?" for _ in ids)
        if ids:
            conn.execute(
                f"""
                UPDATE prompt_entries
                SET category_id = '', updated_at = ?
                WHERE category_id IN ({placeholders});
                """,
                (now, *ids),
            )
        conn.commit()
    finally:
        conn.close()


def _row_to_entry(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    tags_raw = d.pop("tags_json", "[]")
    try:
        tags = json.loads(tags_raw) if tags_raw else []
    except json.JSONDecodeError:
        tags = []
    if not isinstance(tags, list):
        tags = []
    d["tags"] = [str(t) for t in tags]
    d["favorited"] = bool(d.get("favorited"))
    if d.get("preview_image_key"):
        d["preview_image_key"] = str(d["preview_image_key"])
    else:
        d["preview_image_key"] = None
    return d


def list_entries() -> list[dict[str, Any]]:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, title, body, kind, category_id, tags_json, favorited,
                   preview_image_key, created_at, updated_at
            FROM prompt_entries
            ORDER BY updated_at DESC;
            """
        )
        return [_row_to_entry(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_entry(entry_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, title, body, kind, category_id, tags_json, favorited,
                   preview_image_key, created_at, updated_at
            FROM prompt_entries WHERE id = ?;
            """,
            (entry_id,),
        )
        row = cur.fetchone()
        return _row_to_entry(row) if row else None
    finally:
        conn.close()


def upsert_entry(
    entry_id: str,
    title: str,
    body: str,
    kind: str,
    category_id: str,
    tags: list[str],
    favorited: bool,
    preview_image_key: str | None,
    created_at: int | None = None,
    updated_at: int | None = None,
) -> dict[str, Any]:
    now = _now_ms()
    ca = created_at if created_at is not None else now
    ua = updated_at if updated_at is not None else now
    if kind not in ("positive", "negative", "full"):
        kind = "full"
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO prompt_entries (
                id, title, body, kind, category_id, tags_json, favorited,
                preview_image_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                kind = excluded.kind,
                category_id = excluded.category_id,
                tags_json = excluded.tags_json,
                favorited = excluded.favorited,
                preview_image_key = excluded.preview_image_key,
                updated_at = excluded.updated_at;
            """,
            (
                entry_id,
                title.strip() or "未命名",
                body,
                kind,
                category_id or "",
                json.dumps(tags, ensure_ascii=False),
                1 if favorited else 0,
                preview_image_key,
                ca,
                ua,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    row = get_entry(entry_id)
    assert row is not None
    return row


def delete_entry(entry_id: str) -> dict[str, Any] | None:
    old = get_entry(entry_id)
    if old is None:
        return None
    conn = connect()
    try:
        conn.execute("DELETE FROM prompt_entries WHERE id = ?;", (entry_id,))
        conn.commit()
    finally:
        conn.close()
    return old


def import_bundle(
    categories: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    *,
    skip_existing_ids: bool = True,
) -> tuple[int, int]:
    added = 0
    skipped = 0
    existing_cats = {str(c["id"]) for c in list_categories()}
    existing_entries = {str(e["id"]) for e in list_entries()}

    for c in categories:
        cid = str(c.get("id") or uuid.uuid4().hex)
        if skip_existing_ids and cid in existing_cats:
            continue
        upsert_category(
            cid,
            str(c.get("name") or "导入分类"),
            str(c.get("parent_id") or c.get("parentId") or ""),
            int(c.get("sort_order") or c.get("sortOrder") or 0),
            int(c.get("created_at") or c.get("createdAt") or _now_ms()),
            int(c.get("updated_at") or c.get("updatedAt") or _now_ms()),
        )
        existing_cats.add(cid)

    for e in entries:
        eid = str(e.get("id") or uuid.uuid4().hex)
        if skip_existing_ids and eid in existing_entries:
            skipped += 1
            continue
        tags = e.get("tags")
        if not isinstance(tags, list):
            tags = []
        preview_key = e.get("preview_image_key") or e.get("previewImageKey")
        if preview_key is not None:
            preview_key = str(preview_key).strip() or None
        upsert_entry(
            eid,
            str(e.get("title") or "导入"),
            str(e.get("body") or ""),
            str(e.get("kind") or "full"),
            str(e.get("category_id") or e.get("categoryId") or ""),
            [str(t) for t in tags],
            bool(e.get("favorited")),
            preview_key,
            int(e.get("created_at") or e.get("createdAt") or _now_ms()),
            int(e.get("updated_at") or e.get("updatedAt") or _now_ms()),
        )
        existing_entries.add(eid)
        added += 1
    return added, skipped


def export_bundle() -> dict[str, Any]:
    return {
        "version": 3,
        "categories": list_categories(),
        "entries": list_entries(),
    }


def is_empty() -> bool:
    conn = connect()
    try:
        n = int(conn.execute("SELECT COUNT(*) FROM prompt_entries;").fetchone()[0])
        if n > 0:
            return False
        c = int(conn.execute("SELECT COUNT(*) FROM prompt_categories;").fetchone()[0])
        return c <= len(DEFAULT_CATEGORY_NAMES)
    finally:
        conn.close()
