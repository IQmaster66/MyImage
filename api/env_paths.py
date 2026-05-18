"""
统一「模型根目录」解析。

- `api/.hf` / `api/.env` 里是配置文本，不是模型本体。
- 模型文件（Hub 缓存结构 models--* / snapshots，或你解压的目录）放在 HF_MODELS_ROOT 所指文件夹；
  未配置时默认：项目根目录下的 `.hf`（与 `api` 文件夹并列）。
"""

from __future__ import annotations

import os
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent


def hf_models_root() -> Path:
    raw = os.getenv("HF_MODELS_ROOT")
    if raw is None or not str(raw).strip():
        return (_API_DIR.parent / ".hf").resolve()
    p = Path(str(raw).strip().strip('"').strip("'"))
    if not p.is_absolute():
        p = (_API_DIR / p).resolve()
    else:
        p = p.expanduser().resolve()
    return p
