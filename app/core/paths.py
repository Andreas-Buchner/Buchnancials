from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = APP_ROOT / "data"
IMPORTS_DIR = DATA_DIR / "imports"
BACKUPS_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "app.db"
TEMPLATES_DIR = APP_ROOT / "app" / "frontend" / "templates"
STATIC_DIR = APP_ROOT / "app" / "frontend" / "static"


def ensure_data_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

