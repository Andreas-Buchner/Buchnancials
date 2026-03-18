import sqlite3
from pathlib import Path

from app.core.db import init_db
from app.services.snapshot import export_snapshot_bytes, import_snapshot_bytes


def _seed_db(path: Path, dedupe_suffix: str) -> None:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    now = "2026-03-18T00:00:00+00:00"
    conn.execute(
        """
        INSERT INTO import_jobs(filename, column_mapping_json, row_count, new_row_count, duplicate_row_count, failed_row_count, imported_at)
        VALUES ('seed.csv', '{}', 1, 1, 0, 0, ?)
        """,
        (now,),
    )
    import_job_id = conn.execute("SELECT id FROM import_jobs ORDER BY id DESC LIMIT 1").fetchone()["id"]
    conn.execute(
        """
        INSERT INTO transactions(
            booking_date, value_date, amount, currency, counterparty_name, description,
            raw_text, memo, category_id, excluded, dedupe_key, import_job_id, raw_data_json,
            created_at, updated_at
        )
        VALUES ('2026-03-18', NULL, -10.0, NULL, 'Test', 'Snapshot Test', NULL, NULL, NULL, 0, ?, ?, '{}', ?, ?)
        """,
        (f"snapshot-{dedupe_suffix}", import_job_id, now, now),
    )
    conn.commit()
    conn.close()


def test_export_snapshot_bytes_returns_data(tmp_path: Path):
    db_path = tmp_path / "export.db"
    _seed_db(db_path, "a")
    payload = export_snapshot_bytes(db_path)
    assert isinstance(payload, bytes)
    assert len(payload) > 0


def test_import_snapshot_bytes_replaces_database(tmp_path: Path):
    target_db = tmp_path / "target.db"
    source_db = tmp_path / "source.db"
    _seed_db(target_db, "old")
    _seed_db(source_db, "new")

    snapshot_payload = export_snapshot_bytes(source_db)
    result = import_snapshot_bytes(target_db, snapshot_payload, backups_dir=tmp_path / "backups")

    assert result["imported"] is True
    assert result["counts"]["transactions"] == 1

    conn = sqlite3.connect(str(target_db))
    row = conn.execute("SELECT dedupe_key FROM transactions ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    assert row[0] == "snapshot-new"
