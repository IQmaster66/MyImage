"""人物百科元数据：SQLite（姓名、提示词、MinIO image_key）。"""

from __future__ import annotations

import os
import sqlite3
import time
import uuid
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent


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


def init_db() -> None:
    conn = connect()
    try:
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
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters (updated_at);"
        )
        conn.commit()
    finally:
        conn.close()


def list_characters() -> list[dict[str, str | int]]:
    conn = connect()
    try:
        cur = conn.execute(
            """
            SELECT id, name, prompt, image_key, created_at, updated_at
            FROM characters
            ORDER BY updated_at DESC;
            """
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_character(character_id: str) -> dict[str, str | int] | None:
    conn = connect()
    try:
        cur = conn.execute(
            "SELECT id, name, prompt, image_key, created_at, updated_at FROM characters WHERE id = ?;",
            (character_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def insert_character(
    character_id: str,
    name: str,
    prompt: str,
    image_key: str,
) -> dict[str, str | int]:
    now = int(time.time() * 1000)
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO characters (id, name, prompt, image_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (character_id, name, prompt, image_key, now, now),
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
    prompt: str,
    image_key: str,
) -> dict[str, str | int] | None:
    now = int(time.time() * 1000)
    conn = connect()
    try:
        cur = conn.execute(
            """
            UPDATE characters
            SET name = ?, prompt = ?, image_key = ?, updated_at = ?
            WHERE id = ?;
            """,
            (name, prompt, image_key, now, character_id),
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


def new_id() -> str:
    return str(uuid.uuid4())
