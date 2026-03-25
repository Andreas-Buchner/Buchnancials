import os
import sys
from pathlib import Path


APP_NAME = "Buchnancials"


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _resolve_app_root() -> Path:
    if _is_frozen():
        bundle_dir = getattr(sys, "_MEIPASS", None)
        if bundle_dir:
            return Path(bundle_dir).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def _resolve_data_dir(app_root: Path) -> Path:
    override = os.getenv("BUCHNANCIALS_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    if _is_frozen():
        local_appdata = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA")
        if local_appdata:
            return Path(local_appdata).expanduser().resolve() / APP_NAME
        return Path.home().resolve() / f".{APP_NAME.lower()}"

    return app_root / "data"


APP_ROOT = _resolve_app_root()
DATA_DIR = _resolve_data_dir(APP_ROOT)
IMPORTS_DIR = DATA_DIR / "imports"
BACKUPS_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "app.db"
TEMPLATES_DIR = APP_ROOT / "app" / "frontend" / "templates"
STATIC_DIR = APP_ROOT / "app" / "frontend" / "static"


def ensure_data_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
