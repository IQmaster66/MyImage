"""临时插画元数据：SQLite（标题、SD 参数、MinIO image_key、内容哈希）。"""

from __future__ import annotations

import os
import sqlite3
import time
import uuid
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent


def db_path() -> Path:
    raw = os.getenv("TEMP_ILLUSTRATIONS_DB_PATH", "").strip().strip('"').strip("'")
    if raw:
        return Path(raw)
    return _API_DIR / "data" / "temp_illustrations.db"


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS temp_illustrations (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                sd_raw TEXT,
                image_key TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_temp_illustrations_created_at ON temp_illustrations (created_at);"
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_temp_illustrations_dup
            ON temp_illustrations (content_sha256, mime_type);
            """
        )
        conn.commit()
    finally:
        conn.close()


def list_entries() -> list[dict[str, str | int | None]]:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, title, mime_type, sd_raw, image_key, content_sha256, created_at
            FROM temp_illustrations
            ORDER BY created_at DESC;
            """
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_entry(entry_id: str) -> dict[str, str | int | None] | None:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, title, mime_type, sd_raw, image_key, content_sha256, created_at
            FROM temp_illustrations
            WHERE id = ?;
            """,
            (entry_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def insert_entry(
    entry_id: str,
    title: str,
    mime_type: str,
    sd_raw: str | None,
    image_key: str,
    content_sha256: str,
) -> dict[str, str | int | None]:
    now = int(time.time() * 1000)
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO temp_illustrations
            (id, title, mime_type, sd_raw, image_key, content_sha256, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (entry_id, title, mime_type, sd_raw, image_key, content_sha256, now),
        )
        conn.commit()
    except sqlite3.IntegrityError as e:
        conn.rollback()
        raise ValueError("条目 id 已存在") from e
    finally:
        conn.close()
    row = get_entry(entry_id)
    assert row is not None
    return row


def update_entry(
    entry_id: str,
    *,
    title: str | None = None,
    sd_raw: str | None = None,
    clear_sd_raw: bool = False,
) -> dict[str, str | int | None] | None:
    old = get_entry(entry_id)
    if old is None:
        return None
    new_title = title.strip() if title is not None else str(old["title"])
    if clear_sd_raw:
        new_sd: str | None = None
    elif sd_raw is not None:
        new_sd = sd_raw.strip() if sd_raw.strip() else None
    else:
        raw = old.get("sd_raw")
        new_sd = raw.strip() if isinstance(raw, str) and raw.strip() else None
    conn = connect()
    try:
        cur = conn.execute(
            """
            UPDATE temp_illustrations
            SET title = ?, sd_raw = ?
            WHERE id = ?;
            """,
            (new_title, new_sd, entry_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_entry(entry_id)


def delete_entry(entry_id: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("DELETE FROM temp_illustrations WHERE id = ?;", (entry_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_all_entries() -> list[str]:
    """删除全部条目，返回需清理的 MinIO image_key 列表。"""
    conn = connect()
    try:
        cur = conn.execute("SELECT image_key FROM temp_illustrations;")
        keys = [str(r["image_key"]) for r in cur.fetchall() if r["image_key"]]
        conn.execute("DELETE FROM temp_illustrations;")
        conn.commit()
        return keys
    finally:
        conn.close()


def find_duplicate(content_sha256: str, mime_type: str, sd_raw: str | None) -> dict[str, str | int | None] | None:
    norm_mime = mime_type.split(";")[0].strip().lower() or "application/octet-stream"
    norm_sd = sd_raw.strip() if sd_raw and sd_raw.strip() else None
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, title, mime_type, sd_raw, image_key, content_sha256, created_at
            FROM temp_illustrations
            WHERE content_sha256 = ?;
            """,
            (content_sha256.lower(),),
        )
        for row in cur.fetchall():
            d = dict(row)
            row_mime = str(d["mime_type"]).split(";")[0].strip().lower() or "application/octet-stream"
            if row_mime != norm_mime:
                continue
            raw = d.get("sd_raw")
            row_sd = raw.strip() if isinstance(raw, str) and raw.strip() else None
            if row_sd != norm_sd:
                continue
            return d
    finally:
        conn.close()
    return None


def new_id() -> str:
    return str(uuid.uuid4())
