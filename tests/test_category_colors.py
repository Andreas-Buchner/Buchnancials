import sqlite3
from contextlib import contextmanager

import pytest
from fastapi import HTTPException

from app.api import routes_categories
from app.core.category_colors import CATEGORY_COLOR_PALETTES
from app.core.db import init_db
from app.models.category import CategoryCreate, CategoryPatch


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


@contextmanager
def _connection_ctx(conn: sqlite3.Connection):
    yield conn


def test_create_category_without_color_uses_next_palette_color(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    new_expense = routes_categories.create_category(CategoryCreate(name="Transport", type="expense"))
    new_income = routes_categories.create_category(CategoryCreate(name="Freelance", type="income"))

    assert new_expense["color"] == CATEGORY_COLOR_PALETTES["expense"][2]
    assert new_income["color"] == CATEGORY_COLOR_PALETTES["income"][1]
    assert "active" not in new_expense
    assert "active" not in new_income


def test_create_category_without_color_cycles_palette(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    palette = CATEGORY_COLOR_PALETTES["expense"]
    start_count = conn.execute("SELECT COUNT(*) AS cnt FROM categories WHERE type = 'expense'").fetchone()["cnt"]
    creations_needed = len(palette) - start_count + 1

    created = []
    for idx in range(creations_needed):
        created.append(
            routes_categories.create_category(
                CategoryCreate(name=f"Expense {idx}", type="expense")
            )
        )

    assert created[-1]["color"] == palette[0]


def test_create_category_keeps_explicit_color(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    created = routes_categories.create_category(
        CategoryCreate(name="Bonus", type="income", color="#123abc")
    )

    assert created["color"] == "#123abc"


def test_create_category_name_must_be_unique_within_same_type(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    routes_categories.create_category(CategoryCreate(name="Freelance", type="expense"))
    routes_categories.create_category(CategoryCreate(name="Freelance", type="income"))

    with pytest.raises(HTTPException) as expense_exc:
        routes_categories.create_category(CategoryCreate(name="  freelance  ", type="expense"))
    assert expense_exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        routes_categories.create_category(CategoryCreate(name="  freelance  ", type="income"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "Category name already exists."


def test_update_category_type_checks_uniqueness_within_target_type(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    income = routes_categories.create_category(CategoryCreate(name="Freelance", type="income"))
    routes_categories.create_category(CategoryCreate(name="Freelance", type="expense"))

    with pytest.raises(HTTPException) as exc:
        routes_categories.update_category(income["id"], CategoryPatch(type="expense"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "Category name already exists."


def test_delete_category_reassigns_transactions_and_rules(monkeypatch):
    conn = _conn()
    monkeypatch.setattr(routes_categories, "get_connection", lambda: _connection_ctx(conn))

    category = routes_categories.create_category(CategoryCreate(name="Travel", type="expense"))
    category_id = category["id"]
    now = "2026-03-20T00:00:00+00:00"

    conn.execute(
        """
        INSERT INTO import_jobs(filename, column_mapping_json, row_count, new_row_count, duplicate_row_count, failed_row_count, imported_at)
        VALUES ('seed.csv', '{}', 2, 2, 0, 0, ?)
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
        VALUES ('2026-03-10', NULL, -25.0, 'EUR', NULL, 'Train Ticket', NULL, NULL, ?, 0, 'cat-del-1', ?, '{}', ?, ?)
        """,
        (category_id, import_job_id, now, now),
    )
    conn.execute(
        """
        INSERT INTO transactions(
            booking_date, value_date, amount, currency, counterparty_name, description,
            raw_text, memo, category_id, excluded, dedupe_key, import_job_id, raw_data_json,
            created_at, updated_at
        )
        VALUES ('2026-03-11', NULL, -55.0, 'EUR', NULL, 'Hotel', NULL, NULL, NULL, 0, 'cat-del-2', ?, '{}', ?, ?)
        """,
        (import_job_id, now, now),
    )
    split_tx_id = conn.execute(
        "SELECT id FROM transactions WHERE dedupe_key = 'cat-del-2'"
    ).fetchone()["id"]
    conn.execute(
        """
        INSERT INTO transaction_splits(transaction_id, category_id, amount, excluded, created_at, updated_at)
        VALUES (?, ?, -55.0, 0, ?, ?)
        """,
        (split_tx_id, category_id, now, now),
    )
    conn.execute(
        """
        INSERT INTO rules(
            name, match_field, match_type, match_value, category_id,
            exclude_transaction, priority, active, created_at, updated_at
        )
        VALUES ('Travel Rule', 'description', 'contains', 'train', ?, 0, 10, 1, ?, ?)
        """,
        (category_id, now, now),
    )
    conn.commit()

    usage = routes_categories.get_category_usage(category_id)
    assert usage["direct_transactions"] == 1
    assert usage["split_lines"] == 1
    assert usage["affected_transactions"] == 2
    assert usage["linked_rules"] == 1

    deleted = routes_categories.delete_category(category_id)
    assert deleted["deleted"] is True
    assert deleted["affected_transactions"] == 2

    assert conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone() is None
    assert conn.execute("SELECT COUNT(*) AS cnt FROM transactions WHERE category_id = ?", (category_id,)).fetchone()["cnt"] == 0
    assert conn.execute("SELECT COUNT(*) AS cnt FROM transaction_splits WHERE category_id = ?", (category_id,)).fetchone()["cnt"] == 0
    assert conn.execute("SELECT COUNT(*) AS cnt FROM rules WHERE category_id = ?", (category_id,)).fetchone()["cnt"] == 0
