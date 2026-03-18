from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.paths import DB_PATH, IMPORTS_DIR


@dataclass(frozen=True)
class Settings:
    app_name: str = "Buchnancials"
    db_path: Path = DB_PATH
    imports_dir: Path = IMPORTS_DIR
    preview_row_limit: int = 15


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

