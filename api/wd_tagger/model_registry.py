import os

from wd_tagger.interrogator import Interrogator


def _snap(env_key: str) -> str | None:
    v = os.getenv(env_key, "").strip()
    return v or None


INTERROGATORS: dict[str, Interrogator] = {
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
}


def list_models() -> list[str]:
    return sorted(INTERROGATORS.keys())
