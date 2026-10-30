import os
from typing import Union

from wd_tagger.camie_interrogator import CamieInterrogator
from wd_tagger.interrogator import Interrogator

AnyInterrogator = Union[Interrogator, CamieInterrogator]


def _snap(env_key: str) -> str | None:
    v = os.getenv(env_key, "").strip()
    return v or None


INTERROGATORS: dict[str, AnyInterrogator] = {
    # —— WD14 v2（已有）——
    "wd14-convnextv2-v2": Interrogator(
        name="wd14-convnextv2-v2",
        repo_id="SmilingWolf/wd-v1-4-convnextv2-tagger-v2",
        revision="v2.0",
        local_snapshot=_snap("WD_CONVNEXTV2_PATH"),
    ),
    "wd14-vit-v2": Interrogator(
        name="wd14-vit-v2",
        repo_id="SmilingWolf/wd-v1-4-vit-tagger-v2",
        revision="v2.0",
        local_snapshot=_snap("WD_VIT_PATH"),
    ),
    "wd14-swinv2-v2": Interrogator(
        name="wd14-swinv2-v2",
        repo_id="SmilingWolf/wd-v1-4-swinv2-tagger-v2",
        revision="v2.0",
        local_snapshot=_snap("WD_SWINV2_PATH"),
    ),
    # —— WD Tagger v3 ——
    "wd-vit-large-v3": Interrogator(
        name="wd-vit-large-v3",
        repo_id="SmilingWolf/wd-vit-large-tagger-v3",
        local_snapshot=_snap("WD_VIT_LARGE_V3_PATH"),
    ),
    "wd-swinv2-v3": Interrogator(
        name="wd-swinv2-v3",
        repo_id="SmilingWolf/wd-swinv2-tagger-v3",
        local_snapshot=_snap("WD_SWINV2_V3_PATH"),
    ),
    "wd-convnext-v3": Interrogator(
        name="wd-convnext-v3",
        repo_id="SmilingWolf/wd-convnext-tagger-v3",
        local_snapshot=_snap("WD_CONVNEXT_V3_PATH"),
    ),
    # —— Camie Tagger v2 ——
    "camie-tagger-v2": CamieInterrogator(
        name="camie-tagger-v2",
        repo_id="Camais03/camie-tagger-v2",
        local_snapshot=_snap("CAMIE_TAGGER_PATH"),
    ),
}


def list_models() -> list[str]:
    return sorted(INTERROGATORS.keys())
