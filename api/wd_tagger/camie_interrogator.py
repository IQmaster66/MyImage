"""Camie Tagger v2（Camais03）ONNX 反推。

与 WD14 不同：ImageNet 归一化、512 黑边填充、JSON 元数据、输出需 sigmoid。
对外仍返回 (ratings, tags)，便于复用 /wd/interrogate。
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
from huggingface_hub import hf_hub_download
from onnxruntime import InferenceSession
from PIL import Image

from env_paths import hf_models_root


def _use_cpu() -> bool:
    return os.getenv("WD_USE_CPU", "false").lower() in ("1", "true", "yes", "on")


# ImageNet mean as RGB pad (0.485*255, …)
_PAD_RGB = (124, 116, 104)
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def preprocess_camie(image: Image.Image, image_size: int = 512) -> np.ndarray:
    """letterbox + ImageNet normalize → NCHW float32."""
    img = image.convert("RGB")
    width, height = img.size
    aspect = width / max(height, 1)
    if aspect > 1:
        new_w = image_size
        new_h = max(1, int(new_w / aspect))
    else:
        new_h = image_size
        new_w = max(1, int(new_h * aspect))
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (image_size, image_size), _PAD_RGB)
    canvas.paste(img, ((image_size - new_w) // 2, (image_size - new_h) // 2))

    arr = np.asarray(canvas).astype(np.float32) / 255.0  # HWC
    arr = np.transpose(arr, (2, 0, 1))  # CHW
    arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
    return np.expand_dims(arr, 0)


@dataclass
class CamieInterrogator:
    name: str
    repo_id: str = "Camais03/camie-tagger-v2"
    revision: str | None = None
    model_file: str = "camie-tagger-v2.onnx"
    metadata_file: str = "camie-tagger-v2-metadata.json"
    local_snapshot: str | None = None
    model: InferenceSession | None = None
    idx_to_tag: Dict[str, str] = field(default_factory=dict)
    tag_to_category: Dict[str, str] = field(default_factory=dict)
    image_size: int = 512

    def postprocess_tags(
        self,
        tags: Dict[str, float],
        threshold: float,
        additional_tags: List[str] | None = None,
        exclude_tags: List[str] | None = None,
        replace_underscore: bool = True,
    ) -> Dict[str, float]:
        additional_tags = additional_tags or []
        exclude_tags = exclude_tags or []

        for tag in additional_tags:
            tags[tag] = 1.0

        filtered = {
            tag: confidence
            for tag, confidence in sorted(tags.items(), key=lambda item: item[1], reverse=True)
            if confidence >= threshold and tag not in exclude_tags
        }

        if not replace_underscore:
            return filtered
        return {tag.replace("_", " "): conf for tag, conf in filtered.items()}

    def load(self) -> None:
        if self.model is not None and self.idx_to_tag:
            return

        model_path: Path | None = None
        meta_path: Path | None = None

        snap = self.local_snapshot
        if snap:
            base = Path(snap).expanduser().resolve()
            cm = base / self.model_file
            ct = base / self.metadata_file
            if cm.is_file() and ct.is_file():
                model_path, meta_path = cm, ct

        cache_dir = hf_models_root()
        cache_dir.mkdir(parents=True, exist_ok=True)

        if model_path is None or meta_path is None:
            model_path = Path(
                hf_hub_download(
                    repo_id=self.repo_id,
                    filename=self.model_file,
                    revision=self.revision,
                    cache_dir=str(cache_dir),
                )
            )
            meta_path = Path(
                hf_hub_download(
                    repo_id=self.repo_id,
                    filename=self.metadata_file,
                    revision=self.revision,
                    cache_dir=str(cache_dir),
                )
            )

        with meta_path.open(encoding="utf-8") as f:
            metadata: dict[str, Any] = json.load(f)

        try:
            mapping = metadata["dataset_info"]["tag_mapping"]
            self.idx_to_tag = {str(k): str(v) for k, v in mapping["idx_to_tag"].items()}
            self.tag_to_category = {
                str(k): str(v) for k, v in mapping["tag_to_category"].items()
            }
            img_size = metadata.get("model_info", {}).get("img_size")
            if isinstance(img_size, int) and img_size > 0:
                self.image_size = img_size
        except KeyError as e:
            raise ValueError(f"Camie metadata 结构无效，缺少 {e}") from e

        providers = (
            ["CPUExecutionProvider"]
            if _use_cpu()
            else ["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        self.model = InferenceSession(str(model_path), providers=providers)

    def interrogate(self, image: Image.Image) -> Tuple[Dict[str, float], Dict[str, float]]:
        self.load()
        assert self.model is not None

        batch = preprocess_camie(image, self.image_size)
        input_name = self.model.get_inputs()[0].name
        outputs = self.model.run(None, {input_name: batch})

        # refined logits preferred (index 1), else single output
        logits = outputs[1] if len(outputs) >= 2 else outputs[0]
        probs = 1.0 / (1.0 + np.exp(-logits.astype(np.float64)))
        row = probs[0]

        ratings: Dict[str, float] = {}
        tags: Dict[str, float] = {}
        for idx, conf in enumerate(row):
            c = float(conf)
            if c < 0.01:
                continue
            name = self.idx_to_tag.get(str(idx))
            if not name:
                continue
            cat = self.tag_to_category.get(name, "general")
            if cat == "rating":
                ratings[name] = c
            else:
                # general / character / copyright / artist / meta / year …
                tags[name] = c

        return ratings, tags
