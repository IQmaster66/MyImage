"""
本地推理 API：
- WD14 ONNX 标签反推（参考 `tagger/backend-fastapi`，与 sd-webui-wd14-tagger 同源思路）
- BLIP 自然语言描述反推
- MarianMT 中英互译

`api/.hf`：配置文件（变量表）。真正放模型文件的目录由 **HF_MODELS_ROOT** 指定（默认项目根下的 `.hf` 文件夹）。
其中可写 CAPTION_MODEL_DIR、WD_*_PATH 等覆盖项；详见 `api/.hf.example`。
"""

from __future__ import annotations

import io
import os
import re
import traceback
from pathlib import Path
from typing import Any, Literal

_API_DIR = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv

    _hf_file = _API_DIR / ".hf"
    if _hf_file.is_file():
        load_dotenv(_hf_file)
    load_dotenv(_API_DIR / ".env")
except ImportError:
    pass

import torch
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field


def _env_or_default(key: str, default: str) -> str:
    """dotenv 里若写成 KEY= 空值，getenv 会得到 ''，此时应回退 default。"""
    raw = os.getenv(key)
    if raw is None:
        return default
    s = raw.strip().strip('"').strip("'")
    return s if s else default


# ---------- config ----------

CAPTION_MODEL_DIR = _env_or_default(
    "CAPTION_MODEL_DIR",
    "Salesforce/blip-image-captioning-base",
)
ZH_EN_MODEL_DIR = _env_or_default(
    "ZH_EN_MODEL_DIR",
    "Helsinki-NLP/opus-mt-zh-en",
)
EN_ZH_MODEL_DIR = _env_or_default(
    "EN_ZH_MODEL_DIR",
    "Helsinki-NLP/opus-mt-en-zh",
)

_mb = os.getenv("MAX_UPLOAD_MB")
MAX_UPLOAD_BYTES = int((_mb or "12").strip() or "12") * 1024 * 1024

DEFAULT_WD_MODEL = _env_or_default("WD_DEFAULT_MODEL", "wd14-convnextv2-v2")

from env_paths import hf_models_root

# org/name 形式的 Hub ID；强制用 HF_MODELS_ROOT 作缓存，避免 cwd 下同名文件夹误判。
_HUB_REPO_RE = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*/[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
)


def _from_pretrained_kw(model_ref: str) -> dict[str, Any]:
    ref = model_ref.strip()
    if _HUB_REPO_RE.match(ref):
        root = hf_models_root()
        root.mkdir(parents=True, exist_ok=True)
        return {"cache_dir": str(root)}
    return {}


from character_routes import router as characters_router
from character_store import init_db as init_character_db
from storage_minio import ensure_bucket, router as minio_router
from wd_tagger.interrogator import build_prompt as wd_build_prompt
from wd_tagger.model_registry import INTERROGATORS as WD_INTERROGATORS
from wd_tagger.model_registry import list_models as list_wd_models

# ---------- lazy singletons ----------

_caption_bundle: tuple[str, Any, Any] | None = None
# transformers 5.x 不再提供 pipeline("translation")；存 (model, tokenizer)
_translate_bundles: dict[str, tuple[Any, Any]] = {}


def _device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def get_caption_model() -> tuple[str, Any, Any]:
    global _caption_bundle
    if _caption_bundle is None:
        from transformers import BlipForConditionalGeneration, BlipProcessor

        device = _device()
        kw = _from_pretrained_kw(CAPTION_MODEL_DIR)
        try:
            processor = BlipProcessor.from_pretrained(CAPTION_MODEL_DIR, **kw)
            model = BlipForConditionalGeneration.from_pretrained(CAPTION_MODEL_DIR, **kw)
            model = model.to(device).eval()
        except Exception as e:
            raise RuntimeError(
                f"加载反推模型失败 ({CAPTION_MODEL_DIR}): {e}。"
                " 若离线请把 BLIP 下载到本机后在 api/.hf 填写 CAPTION_MODEL_DIR 为 snapshots 目录；"
                " 并删除 api 下可能存在的同名 Salesforce 文件夹以免误判为本地模型。"
            ) from e
        _caption_bundle = (device, processor, model)
    return _caption_bundle


def _marian_translate(model: Any, tokenizer: Any, text: str, *, max_length: int = 512) -> str:
    device = next(model.parameters()).device
    enc = tokenizer(text, return_tensors="pt", truncation=True, max_length=max_length)
    enc = {k: v.to(device) for k, v in enc.items()}
    with torch.inference_mode():
        out = model.generate(**enc, max_length=max_length)
    return tokenizer.batch_decode(out, skip_special_tokens=True)[0].strip()


def get_translate_bundle(direction: Literal["zh2en", "en2zh"]) -> tuple[Any, Any]:
    global _translate_bundles
    if direction in _translate_bundles:
        return _translate_bundles[direction]

    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    model_id = ZH_EN_MODEL_DIR if direction == "zh2en" else EN_ZH_MODEL_DIR
    kw = _from_pretrained_kw(model_id)
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id, **kw)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_id, **kw)
        model = model.to(_device()).eval()
    except Exception as e:
        raise RuntimeError(f"加载翻译模型失败 ({model_id}): {e}") from e
    _translate_bundles[direction] = (model, tokenizer)
    return model, tokenizer


# ---------- app ----------

app = FastAPI(title="MyImage ML", version="0.1.0")

app.include_router(minio_router)
app.include_router(characters_router)


@app.on_event("startup")
def _startup_minio_and_characters_db():
    ensure_bucket()
    init_character_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    direction: Literal["zh2en", "en2zh"]


class TranslateResponse(BaseModel):
    text: str


class CaptionResponse(BaseModel):
    caption_en: str
    caption_zh: str | None = None


class HealthResponse(BaseModel):
    ok: bool
    device: str
    models_root: str = Field(..., description="HF_MODELS_ROOT 实际路径（模型根目录）")
    caption_model: str
    zh_en_model: str
    en_zh_model: str
    caption_loaded: bool
    translation_zh2en_loaded: bool
    translation_en2zh_loaded: bool
    wd_models: list[str]
    detail: str | None = None


class WdInterrogateResponse(BaseModel):
    ratings: dict[str, float]
    tags: dict[str, float]
    prompt: str
    prompt_weighted: str
    threshold: float
    model: str


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        ok=True,
        device=_device(),
        models_root=str(hf_models_root()),
        caption_model=CAPTION_MODEL_DIR,
        zh_en_model=ZH_EN_MODEL_DIR,
        en_zh_model=EN_ZH_MODEL_DIR,
        caption_loaded=_caption_bundle is not None,
        translation_zh2en_loaded="zh2en" in _translate_bundles,
        translation_en2zh_loaded="en2zh" in _translate_bundles,
        wd_models=list_wd_models(),
        detail=None,
    )


@app.get("/wd/models")
def wd_models():
    return {"models": list_wd_models(), "default": DEFAULT_WD_MODEL}


@app.post("/wd/interrogate", response_model=WdInterrogateResponse)
async def wd_interrogate(
    file: UploadFile = File(...),
    model: str | None = Query(None, description="wd14-convnextv2-v2 / wd14-swinv2-v2 / wd14-vit-v2"),
    threshold: float = Query(0.35, ge=0.0, le=1.0),
    replace_underscore: bool = Query(True),
):
    """WD14 ONNX 反推（Danbooru 风格标签），与 tagger 项目一致。"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "请上传图片文件")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件过大（上限 {MAX_UPLOAD_BYTES // 1024 // 1024} MB）")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError as e:
        raise HTTPException(400, "无法识别为图片") from e

    name = model or DEFAULT_WD_MODEL
    interrogator = WD_INTERROGATORS.get(name)
    if interrogator is None:
        raise HTTPException(400, f"未知 WD 模型 '{name}'")

    try:
        ratings, tags = interrogator.interrogate(image)
        tags = interrogator.postprocess_tags(
            tags=tags,
            threshold=threshold,
            additional_tags=[],
            exclude_tags=[],
            replace_underscore=replace_underscore,
        )
        ratings_f = {str(k): float(v) for k, v in ratings.items()}
        tags_f = {str(k): float(v) for k, v in tags.items()}
        prompt, prompt_weighted = wd_build_prompt(tags_f)
    except Exception:
        traceback.print_exc()
        raise HTTPException(500, "WD 反推失败") from None

    return WdInterrogateResponse(
        ratings=ratings_f,
        tags=tags_f,
        prompt=prompt,
        prompt_weighted=prompt_weighted,
        threshold=threshold,
        model=name,
    )


@app.post("/caption", response_model=CaptionResponse)
async def caption(
    file: UploadFile = File(...),
    include_zh: bool = Query(True, description="是否在英文反推后自动翻译为中文"),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "请上传图片文件")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件过大（上限 {MAX_UPLOAD_BYTES // 1024 // 1024} MB）")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError as e:
        raise HTTPException(400, "无法识别为图片") from e

    try:
        device, processor, model = get_caption_model()
        inputs = processor(images=image, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.inference_mode():
            ids = model.generate(
                **inputs,
                max_length=int(os.getenv("CAPTION_MAX_LENGTH", "120")),
                num_beams=int(os.getenv("CAPTION_NUM_BEAMS", "4")),
            )
        caption_en = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception:
        traceback.print_exc()
        raise HTTPException(500, "反推推理失败") from None

    caption_zh: str | None = None
    if include_zh and caption_en:
        try:
            m, tok = get_translate_bundle("en2zh")
            caption_zh = _marian_translate(m, tok, caption_en, max_length=512)
        except Exception:
            traceback.print_exc()
            caption_zh = None

    return CaptionResponse(caption_en=caption_en, caption_zh=caption_zh)


@app.post("/translate", response_model=TranslateResponse)
def translate(body: TranslateRequest):
    try:
        m, tok = get_translate_bundle(body.direction)
        out = _marian_translate(m, tok, body.text, max_length=512)
        return TranslateResponse(text=out)
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception:
        traceback.print_exc()
        raise HTTPException(500, "翻译推理失败") from None
