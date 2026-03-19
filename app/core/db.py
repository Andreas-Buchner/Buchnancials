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
  color TEXT NULL,
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
  second_match_field TEXT NULL CHECK (second_match_field IN ('description', 'counterparty_name', 'raw_text')),
  second_match_type TEXT NULL,
  second_match_value TEXT NULL,
  condition_operator TEXT NOT NULL DEFAULT 'and' CHECK (condition_operator IN ('and', 'or')),
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
  category_id INTEGER NULL REFERENCES categories(id),
  amount REAL NOT NULL,
  excluded INTEGER NOT NULL DEFAULT 0,
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
    migrate_default_category_names(conn)
    conn.commit()


def migrate_schema(conn: sqlite3.Connection) -> None:
    category_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(categories)").fetchall()
    }
    if "color" not in category_columns:
        conn.execute("ALTER TABLE categories ADD COLUMN color TEXT NULL")

    rule_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(rules)").fetchall()
    }
    if "counterparty_filter" not in rule_columns:
        conn.execute("ALTER TABLE rules ADD COLUMN counterparty_filter TEXT NULL")
    if "amount_sign" not in rule_columns:
        conn.execute(
            "ALTER TABLE rules ADD COLUMN amount_sign TEXT NOT NULL DEFAULT 'any' CHECK (amount_sign IN ('any', 'positive', 'negative'))"
        )
    if "second_match_field" not in rule_columns:
        conn.execute(
            "ALTER TABLE rules ADD COLUMN second_match_field TEXT NULL CHECK (second_match_field IN ('description', 'counterparty_name', 'raw_text'))"
        )
    if "second_match_type" not in rule_columns:
        conn.execute("ALTER TABLE rules ADD COLUMN second_match_type TEXT NULL")
    if "second_match_value" not in rule_columns:
        conn.execute("ALTER TABLE rules ADD COLUMN second_match_value TEXT NULL")
    if "condition_operator" not in rule_columns:
        conn.execute(
            "ALTER TABLE rules ADD COLUMN condition_operator TEXT NOT NULL DEFAULT 'and' CHECK (condition_operator IN ('and', 'or'))"
        )

    split_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(transaction_splits)").fetchall()
    }
    if "excluded" not in split_columns:
        conn.execute("ALTER TABLE transaction_splits ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0")

    split_info = {
        row["name"]: row
        for row in conn.execute("PRAGMA table_info(transaction_splits)").fetchall()
    }
    category_col = split_info.get("category_id")
    if category_col is not None and int(category_col["notnull"]) == 1:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript(
            """
            ALTER TABLE transaction_splits RENAME TO transaction_splits_old;
            CREATE TABLE transaction_splits (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              category_id INTEGER NULL REFERENCES categories(id),
              amount REAL NOT NULL,
              excluded INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            INSERT INTO transaction_splits(id, transaction_id, category_id, amount, excluded, created_at, updated_at)
            SELECT id, transaction_id, category_id, amount, excluded, created_at, updated_at
            FROM transaction_splits_old;
            DROP TABLE transaction_splits_old;
            CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
            """
        )
        conn.execute("PRAGMA foreign_keys = ON")


def seed_default_categories(conn: sqlite3.Connection) -> None:
    existing = conn.execute("SELECT COUNT(*) AS cnt FROM categories").fetchone()["cnt"]
    if existing:
        return

    now = utc_now_iso()
    default_categories = [
        ("Gehalt", "income", "#6d97ad", 1, now, now),
        ("Lebensmittel", "expense", "#b88f7b", 1, now, now),
        ("Miete", "expense", "#8d82ac", 1, now, now),
    ]
    conn.executemany(
        """
        INSERT INTO categories(name, type, color, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        default_categories,
    )


def migrate_default_category_names(conn: sqlite3.Connection) -> None:
    now = utc_now_iso()
    translations = [
        ("Salary", "Gehalt", "income"),
        ("Food", "Lebensmittel", "expense"),
        ("Rent", "Miete", "expense"),
    ]
    for english, german, category_type in translations:
        english_row = conn.execute(
            "SELECT id FROM categories WHERE name = ? AND type = ? ORDER BY id LIMIT 1",
            (english, category_type),
        ).fetchone()
        if english_row is None:
            continue

        german_exists = conn.execute(
            "SELECT 1 FROM categories WHERE name = ? AND type = ? LIMIT 1",
            (german, category_type),
        ).fetchone()
        if german_exists is not None:
            continue

        conn.execute(
            "UPDATE categories SET name = ?, updated_at = ? WHERE id = ?",
            (german, now, english_row["id"]),
        )

    default_colors = {
        ("Gehalt", "income"): "#6d97ad",
        ("Lebensmittel", "expense"): "#b88f7b",
        ("Miete", "expense"): "#8d82ac",
    }
    for (name, category_type), color in default_colors.items():
        conn.execute(
            """
            UPDATE categories
            SET color = ?, updated_at = ?
            WHERE name = ? AND type = ? AND (color IS NULL OR TRIM(color) = '')
            """,
            (color, now, name, category_type),
        )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}
