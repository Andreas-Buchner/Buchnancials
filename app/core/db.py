import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.paths import DB_PATH

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  column_mapping_json TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  new_row_count INTEGER NOT NULL DEFAULT 0,
  duplicate_row_count INTEGER NOT NULL DEFAULT 0,
  failed_row_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  match_field TEXT NOT NULL CHECK (match_field IN ('description', 'counterparty_name', 'raw_text')),
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  counterparty_filter TEXT NULL,
  amount_sign TEXT NOT NULL DEFAULT 'any' CHECK (amount_sign IN ('any', 'positive', 'negative')),
  category_id INTEGER NULL REFERENCES categories(id),
  exclude_transaction INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_date TEXT NOT NULL,
  value_date TEXT NULL,
  amount REAL NOT NULL,
  currency TEXT NULL,
  counterparty_name TEXT NULL,
  description TEXT NOT NULL,
  raw_text TEXT NULL,
  memo TEXT NULL,
  category_id INTEGER NULL REFERENCES categories(id),
  excluded INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  import_job_id INTEGER NOT NULL REFERENCES import_jobs(id),
  raw_data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_booking_date ON transactions(booking_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_import_job_id ON transactions(import_job_id);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority, id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
"""


def utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path or DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    migrate_schema(conn)
    seed_default_categories(conn)
    conn.commit()


def migrate_schema(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(rules)").fetchall()
    }
    if "counterparty_filter" not in columns:
        conn.execute("ALTER TABLE rules ADD COLUMN counterparty_filter TEXT NULL")
    if "amount_sign" not in columns:
        conn.execute(
            "ALTER TABLE rules ADD COLUMN amount_sign TEXT NOT NULL DEFAULT 'any' CHECK (amount_sign IN ('any', 'positive', 'negative'))"
        )


def seed_default_categories(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) AS cnt FROM categories").fetchone()["cnt"]
    if existing:
        return

    now = utc_now_iso()
    default_categories = [
        ("Salary", "income", 1, now, now),
        ("Food", "expense", 1, now, now),
        ("Rent", "expense", 1, now, now),
    ]
    conn.executemany(
        """
        INSERT INTO categories(name, type, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        default_categories,
    )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}
