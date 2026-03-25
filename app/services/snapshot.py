import os
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.db import get_connection, init_db
from app.core.paths import BACKUPS_DIR

REQUIRED_TABLES = {
    "categories",
    "import_jobs",
    "rules",
    "transactions",
    "transaction_splits",
}


class SnapshotError(ValueError):
    pass


def _copy_sqlite_database(source_path: Path, target_path: Path) -> None:
    source_conn: sqlite3.Connection | None = None
    target_conn: sqlite3.Connection | None = None
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        source_conn = sqlite3.connect(str(source_path), timeout=10)
        target_conn = sqlite3.connect(str(target_path), timeout=10)
        source_conn.backup(target_conn, pages=100, sleep=0.1)
        target_conn.commit()
    except sqlite3.Error as exc:
        raise SnapshotError(
            "Snapshot konnte nicht in die laufende Datenbank übernommen werden. "
            "Bitte schließe andere geoeffnete Buchnancials-Fenster und versuche es erneut."
        ) from exc
    finally:
        if target_conn is not None:
            try:
                target_conn.close()
            except Exception:
                pass
        if source_conn is not None:
            try:
                source_conn.close()
            except Exception:
                pass


def _validate_snapshot_file(path: Path) -> None:
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(str(path))
        table_rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        tables = {row[0] for row in table_rows}
        missing = REQUIRED_TABLES - tables
        if missing:
            raise SnapshotError(f"Snapshot ist unvollständig. Fehlende Tabellen: {', '.join(sorted(missing))}")

        integrity = conn.execute("PRAGMA integrity_check").fetchone()
        if not integrity or integrity[0] != "ok":
            raise SnapshotError("Snapshot ist beschädigt (integrity_check fehlgeschlagen).")
    except sqlite3.DatabaseError as exc:
        raise SnapshotError("Datei ist keine gültige SQLite-Datenbank.") from exc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def export_snapshot_bytes(db_path: Path) -> bytes:
    if not db_path.exists():
        raise SnapshotError("Es wurde noch keine Datenbank gefunden.")
    return db_path.read_bytes()


def import_snapshot_bytes(
    db_path: Path,
    snapshot_bytes: bytes,
    *,
    backups_dir: Path | None = None,
) -> dict[str, Any]:
    if not snapshot_bytes:
        raise SnapshotError("Die Snapshot-Datei ist leer.")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    target_backup_dir = backups_dir or BACKUPS_DIR
    target_backup_dir.mkdir(parents=True, exist_ok=True)

    fd, temp_name = tempfile.mkstemp(prefix="snapshot-import-", suffix=".db", dir=str(db_path.parent))
    os.close(fd)
    temp_path = Path(temp_name)
    temp_path.write_bytes(snapshot_bytes)

    try:
        _validate_snapshot_file(temp_path)

        backup_name = None
        if db_path.exists():
            backup_name = f"app-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
            _copy_sqlite_database(db_path, target_backup_dir / backup_name)

        _copy_sqlite_database(temp_path, db_path)

        with get_connection(db_path) as conn:
            init_db(conn)
            counts = {
                "transactions": conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
                "categories": conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0],
                "rules": conn.execute("SELECT COUNT(*) FROM rules").fetchone()[0],
                "import_jobs": conn.execute("SELECT COUNT(*) FROM import_jobs").fetchone()[0],
            }

        return {
            "imported": True,
            "backup_file": backup_name,
            "counts": counts,
        }
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
