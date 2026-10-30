"""
统一「模型根目录」解析。

- `api/.hf` / `api/.env` 里是配置文本，不是模型本体。
- 模型文件（Hub 缓存结构 models--* / snapshots，或你解压的目录）放在 HF_MODELS_ROOT 所指文件夹；
  未配置时默认：项目根目录下的 `.hf`（与 `api` 文件夹并列）。
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

_API_DIR = Path(__file__).resolve().parent

# org/name 形式的 Hub ID
_HUB_REPO_RE = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*/[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
)


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


def hub_cache_dir_for_repo(repo_id: str) -> Path:
    """Helsinki-NLP/opus-mt-en-zh → models--Helsinki-NLP--opus-mt-en-zh"""
    return hf_models_root() / ("models--" + repo_id.strip().replace("/", "--"))


def _snapshot_has_weights(snap: Path) -> bool:
    if not (snap / "config.json").is_file():
        return False
    if (snap / "pytorch_model.bin").is_file():
        return True
    if (snap / "model.safetensors").is_file():
        return True
    return any(snap.glob("*.safetensors"))


def find_cached_hub_snapshot(repo_id: str) -> Path | None:
    """在 HF_MODELS_ROOT 下查找已下载完整的 snapshots 目录。"""
    snaps = hub_cache_dir_for_repo(repo_id) / "snapshots"
    if not snaps.is_dir():
        return None
    candidates = [d for d in snaps.iterdir() if d.is_dir() and _snapshot_has_weights(d)]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def resolve_local_model_dir(ref: str) -> Path | None:
    """解析为含 config.json 的本地目录（相对路径相对于 api/）。"""
    raw = ref.strip().strip('"').strip("'")
    if not raw or _HUB_REPO_RE.match(raw):
        return None
    p = Path(raw)
    if not p.is_absolute():
        p = (_API_DIR / p).resolve()
    else:
        p = p.expanduser().resolve()
    return p if (p / "config.json").is_file() else None


def resolve_hf_model_ref(model_ref: str) -> tuple[str, dict[str, Any]]:
    """
    返回 (from_pretrained 路径, 额外 kwargs)。
    优先使用本机已缓存的 snapshots，并 local_files_only 避免 Win 下连 Hub 超时。
    """
    ref = model_ref.strip()
    local = resolve_local_model_dir(ref)
    if local is not None:
        return str(local), {"local_files_only": True}

    if _HUB_REPO_RE.match(ref):
        snap = find_cached_hub_snapshot(ref)
        if snap is not None:
            return str(snap), {"local_files_only": True}
        root = hf_models_root()
        root.mkdir(parents=True, exist_ok=True)
        return ref, {"cache_dir": str(root)}

    return ref, {}
