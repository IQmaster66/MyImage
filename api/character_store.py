"""人物百科元数据：SQLite（姓名、提示词、出自来源、MinIO image_key）。"""

from __future__ import annotations

import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

_API_DIR = Path(__file__).resolve().parent

MAX_SOURCE_DEPTH = 3
ROOT_PARENT_ID = ""


def db_path() -> Path:
    raw = os.getenv("CHARACTERS_DB_PATH", "").strip().strip('"').strip("'")
    if raw:
        return Path(raw)
    return _API_DIR / "data" / "characters.db"


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _now_ms() -> int:
    return int(time.time() * 1000)


def _table_columns(conn: sqlite3.Connection, table: str = "characters") -> set[str]:
    cur = conn.execute(f"PRAGMA table_info({table});")
    return {str(r[1]) for r in cur.fetchall()}


def _migrate_prompt_columns(conn: sqlite3.Connection) -> None:
    """旧库仅有 prompt：拆成 prompt_clothed / prompt_unclothed，并保持 prompt 与带服装同步。"""
    cols = _table_columns(conn)
    if "prompt_clothed" not in cols:
        conn.execute(
            "ALTER TABLE characters ADD COLUMN prompt_clothed TEXT NOT NULL DEFAULT '';"
        )
        conn.execute(
            "UPDATE characters SET prompt_clothed = COALESCE(prompt, '') WHERE prompt_clothed = '';"
        )
    if "prompt_unclothed" not in cols:
        conn.execute(
            "ALTER TABLE characters ADD COLUMN prompt_unclothed TEXT NOT NULL DEFAULT '';"
        )


def _migrate_source_column(conn: sqlite3.Connection) -> None:
    cols = _table_columns(conn)
    if "source_id" not in cols:
        conn.execute(
            "ALTER TABLE characters ADD COLUMN source_id TEXT NOT NULL DEFAULT '';"
        )


def init_db() -> None:
    conn = connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS character_sources (
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
            "CREATE INDEX IF NOT EXISTS idx_character_sources_parent ON character_sources (parent_id);"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                image_key TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """
        )
        _migrate_prompt_columns(conn)
        _migrate_source_column(conn)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters (updated_at);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_characters_source ON characters (source_id);"
        )
        conn.commit()
    finally:
        conn.close()


_SELECT = """
    SELECT id, name, prompt, prompt_clothed, prompt_unclothed,
           source_id, image_key, created_at, updated_at
    FROM characters
"""


def _normalize_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    clothed = str(d.get("prompt_clothed") or "").strip()
    unclothed = str(d.get("prompt_unclothed") or "").strip()
    legacy = str(d.get("prompt") or "").strip()
    if not clothed and legacy:
        clothed = legacy
    d["prompt_clothed"] = clothed
    d["prompt_unclothed"] = unclothed
    # 兼容旧前端/后台副标题：prompt ≡ 带服装
    d["prompt"] = clothed
    d["source_id"] = str(d.get("source_id") or "").strip()
    return d


def list_characters() -> list[dict[str, Any]]:
    conn = connect()
    try:
        cur = conn.execute(f"{_SELECT} ORDER BY updated_at DESC;")
        return [_normalize_row(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_character(character_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        cur = conn.execute(f"{_SELECT} WHERE id = ?;", (character_id,))
        row = cur.fetchone()
        return _normalize_row(row) if row else None
    finally:
        conn.close()


def insert_character(
    character_id: str,
    name: str,
    prompt_clothed: str,
    prompt_unclothed: str,
    image_key: str,
    source_id: str = "",
) -> dict[str, Any]:
    now = _now_ms()
    clothed = prompt_clothed.strip()
    unclothed = prompt_unclothed.strip()
    sid = (source_id or "").strip()
    if sid and get_source(sid) is None:
        raise ValueError("出自来源不存在")
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO characters
            (id, name, prompt, prompt_clothed, prompt_unclothed, source_id,
             image_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (character_id, name, clothed, clothed, unclothed, sid, image_key, now, now),
        )
        conn.commit()
    except sqlite3.IntegrityError as e:
        conn.rollback()
        raise ValueError("人物 id 已存在") from e
    finally:
        conn.close()
    row = get_character(character_id)
    assert row is not None
    return row


def update_character(
    character_id: str,
    name: str,
    prompt_clothed: str,
    prompt_unclothed: str,
    image_key: str,
    source_id: str = "",
) -> dict[str, Any] | None:
    now = _now_ms()
    clothed = prompt_clothed.strip()
    unclothed = prompt_unclothed.strip()
    sid = (source_id or "").strip()
    if sid and get_source(sid) is None:
        raise ValueError("出自来源不存在")
    conn = connect()
    try:
        cur = conn.execute(
            """
            UPDATE characters
            SET name = ?, prompt = ?, prompt_clothed = ?, prompt_unclothed = ?,
                source_id = ?, image_key = ?, updated_at = ?
            WHERE id = ?;
            """,
            (name, clothed, clothed, unclothed, sid, image_key, now, character_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_character(character_id)


def delete_character(character_id: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("DELETE FROM characters WHERE id = ?;", (character_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_all_characters() -> list[str]:
    """删除全部人物，返回需清理的 MinIO image_key 列表。"""
    conn = connect()
    try:
        cur = conn.execute("SELECT image_key FROM characters;")
        keys = [str(r["image_key"]) for r in cur.fetchall() if r["image_key"]]
        conn.execute("DELETE FROM characters;")
        conn.commit()
        return keys
    finally:
        conn.close()


def new_id() -> str:
    return str(uuid.uuid4())


# —— 出自来源（侧栏分类树）——


def list_sources() -> list[dict[str, Any]]:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, name, parent_id, sort_order, created_at, updated_at
            FROM character_sources
            ORDER BY sort_order ASC, name ASC;
            """
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_source(source_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, name, parent_id, sort_order, created_at, updated_at
            FROM character_sources WHERE id = ?;
            """,
            (source_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _source_depth(sources: list[dict[str, Any]], sid: str) -> int:
    by_id = {str(c["id"]): c for c in sources}
    depth = 0
    cur = sid
    seen: set[str] = set()
    while cur and cur in by_id:
        if cur in seen:
            break
        seen.add(cur)
        depth += 1
        cur = str(by_id[cur].get("parent_id") or "")
    return depth


def _descendant_source_ids(sources: list[dict[str, Any]], root_id: str) -> list[str]:
    children: dict[str, list[str]] = {}
    for c in sources:
        p = str(c.get("parent_id") or "")
        children.setdefault(p, []).append(str(c["id"]))
    out: list[str] = []
    stack = [root_id]
    while stack:
        cid = stack.pop()
        out.append(cid)
        stack.extend(children.get(cid, []))
    return out


def upsert_source(
    source_id: str,
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
            INSERT INTO character_sources (id, name, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                parent_id = excluded.parent_id,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at;
            """,
            (source_id, name.strip() or "未命名来源", parent_id or "", sort_order, ca, ua),
        )
        conn.commit()
    finally:
        conn.close()
    row = get_source(source_id)
    assert row is not None
    return row


def create_source(name: str, parent_id: str = ROOT_PARENT_ID) -> dict[str, Any]:
    sources = list_sources()
    parent = (parent_id or "").strip()
    if parent:
        if not any(str(c["id"]) == parent for c in sources):
            raise ValueError("父来源不存在")
        depth = _source_depth(sources, parent) + 1
        if depth > MAX_SOURCE_DEPTH:
            raise ValueError(f"最多支持 {MAX_SOURCE_DEPTH} 级来源")
    siblings = [c for c in sources if str(c.get("parent_id") or "") == parent]
    max_order = max((int(c["sort_order"]) for c in siblings), default=-1)
    sid = uuid.uuid4().hex
    return upsert_source(sid, name, parent, max_order + 1)


def delete_source(source_id: str) -> None:
    if not source_id:
        return
    sources = list_sources()
    ids = set(_descendant_source_ids(sources, source_id))
    conn = connect()
    try:
        now = _now_ms()
        for sid in ids:
            conn.execute("DELETE FROM character_sources WHERE id = ?;", (sid,))
        placeholders = ",".join("?" for _ in ids)
        if ids:
            conn.execute(
                f"""
                UPDATE characters
                SET source_id = '', updated_at = ?
                WHERE source_id IN ({placeholders});
                """,
                (now, *ids),
            )
        conn.commit()
    finally:
        conn.close()
