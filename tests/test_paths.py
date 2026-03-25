import importlib
import sys
from pathlib import Path

import pytest


def _reload_paths_module():
    import app.core.paths

    return importlib.reload(app.core.paths)


@pytest.fixture(autouse=True)
def _restore_default_paths_state(monkeypatch):
    yield
    monkeypatch.delenv("BUCHNANCIALS_DATA_DIR", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)
    _reload_paths_module()


def test_dev_mode_uses_repo_data_dir(monkeypatch):
    monkeypatch.delenv("BUCHNANCIALS_DATA_DIR", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)

    paths = _reload_paths_module()

    assert paths.DATA_DIR == paths.APP_ROOT / "data"
    assert paths.DB_PATH == paths.DATA_DIR / "app.db"


def test_frozen_mode_uses_local_appdata(monkeypatch, tmp_path: Path):
    bundle_root = tmp_path / "bundle"
    local_appdata = tmp_path / "LocalAppData"
    monkeypatch.delenv("BUCHNANCIALS_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(bundle_root), raising=False)

    paths = _reload_paths_module()

    assert paths.APP_ROOT == bundle_root.resolve()
    assert paths.DATA_DIR == (local_appdata / "Buchnancials").resolve()
    assert paths.TEMPLATES_DIR == bundle_root.resolve() / "app" / "frontend" / "templates"


def test_data_dir_override_wins_even_when_frozen(monkeypatch, tmp_path: Path):
    override = tmp_path / "custom-data"
    bundle_root = tmp_path / "bundle"
    monkeypatch.setenv("BUCHNANCIALS_DATA_DIR", str(override))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(bundle_root), raising=False)

    paths = _reload_paths_module()

    assert paths.DATA_DIR == override.resolve()
