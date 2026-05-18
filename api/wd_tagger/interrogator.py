from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Tuple
import base64
import os

import numpy as np
import pandas as pd
from huggingface_hub import hf_hub_download
from PIL import Image
from onnxruntime import InferenceSession

from env_paths import hf_models_root

from wd_tagger import dbimutils


def _use_cpu() -> bool:
    return os.getenv("WD_USE_CPU", "false").lower() in ("1", "true", "yes", "on")


def decode_base64_image(image_base64: str) -> Image.Image:
    data = image_base64.split(",", 1)[-1]
    decoded = base64.b64decode(data)
    return Image.open(BytesIO(decoded))


@dataclass
class Interrogator:
    name: str
    repo_id: str
    revision: str | None = None
    model_file: str = "model.onnx"
    tags_file: str = "selected_tags.csv"
    """若设置：指向含 model.onnx 与 selected_tags.csv 的目录（如 HF snapshots 文件夹）。"""
    local_snapshot: str | None = None
    local_dir: str | None = None
    model: InferenceSession | None = None
    tags_df: pd.DataFrame | None = None

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
            for tag, confidence in sorted(
                tags.items(), key=lambda item: item[1], reverse=True
            )
            if confidence >= threshold and tag not in exclude_tags
        }

        if not replace_underscore:
            return filtered

        return {tag.replace("_", " "): conf for tag, conf in filtered.items()}

    def load(self) -> None:
        if self.model is not None and self.tags_df is not None:
            return

        model_path: Path | None = None
        tags_path: Path | None = None

        snap = self.local_snapshot
        if snap:
            base = Path(snap).expanduser().resolve()
            cm = base / self.model_file
            ct = base / self.tags_file
            if cm.is_file() and ct.is_file():
                model_path = cm
                tags_path = ct

        local_dir = self.local_dir or os.environ.get("TAGGER_MODEL_DIR")
        if (model_path is None or tags_path is None) and local_dir:
            base = Path(local_dir).expanduser().resolve()
            candidate_model = base / self.name / self.model_file
            candidate_tags = base / self.name / self.tags_file
            if candidate_model.is_file() and candidate_tags.is_file():
                model_path = candidate_model
                tags_path = candidate_tags

        cache_dir = hf_models_root()
        cache_dir.mkdir(parents=True, exist_ok=True)

        if model_path is None or tags_path is None:
            model_path = Path(
                hf_hub_download(
                    repo_id=self.repo_id,
                    filename=self.model_file,
                    revision=self.revision,
                    cache_dir=str(cache_dir),
                )
            )
            tags_path = Path(
                hf_hub_download(
                    repo_id=self.repo_id,
                    filename=self.tags_file,
                    revision=self.revision,
                    cache_dir=str(cache_dir),
                )
            )

        providers = (
            ["CPUExecutionProvider"]
            if _use_cpu()
            else ["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        self.model = InferenceSession(str(model_path), providers=providers)
        self.tags_df = pd.read_csv(tags_path)

    def interrogate(self, image: Image.Image) -> Tuple[Dict[str, float], Dict[str, float]]:
        self.load()
        assert self.model is not None
        assert self.tags_df is not None

        _, height, _, _ = self.model.get_inputs()[0].shape

        image = image.convert("RGBA")
        canvas = Image.new("RGBA", image.size, "WHITE")
        canvas.paste(image, mask=image)
        image = canvas.convert("RGB")

        image_arr = np.asarray(image)
        image_arr = image_arr[:, :, ::-1]
        image_arr = dbimutils.make_square(image_arr, height)
        image_arr = dbimutils.smart_resize(image_arr, height)
        image_arr = image_arr.astype(np.float32)
        image_arr = np.expand_dims(image_arr, 0)

        input_name = self.model.get_inputs()[0].name
        output_name = self.model.get_outputs()[0].name
        confidences = self.model.run([output_name], {input_name: image_arr})[0]

        tags = self.tags_df[["name"]].copy()
        tags["confidences"] = confidences[0]

        ratings = dict(tags[:4].values)
        regular_tags = dict(tags[4:].values)
        return ratings, regular_tags


def build_prompt(tags: dict[str, float]) -> tuple[str, str]:
    prompt = ", ".join(tags.keys())
    prompt_weighted = ", ".join([f"({t}:{(1 + c * 0.6):.2f})" for t, c in tags.items()])
    return prompt, prompt_weighted
