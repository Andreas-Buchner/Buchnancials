import sqlite3

from app.core.db import init_db
from app.services.categorization import apply_active_rules_to_transactions
from app.services.csv_import import execute_import
from app.services.reporting import build_planning_dataset, list_transactions_for_period, summarize
from app.services.sankey import build_sankey


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def test_import_skips_duplicates_and_builds_summary():
    csv_bytes = (
        "booking_date,amount,description\n"
        "2026-03-01,3000,Salary March\n"
        "2026-03-02,-900,Rent March\n"
        "2026-03-02,-900,Rent March\n"
    ).encode("utf-8")
    mapping = {
        "booking_date": "booking_date",
        "amount": "amount",
        "description": "description",
    }
    conn = _conn()
    result = execute_import(conn, "sample.csv", csv_bytes, mapping)
    assert result["imported_new"] == 2
    assert result["ignored_duplicates"] == 1
    assert result["failed_rows"] == 0

    rows = list_transactions_for_period(conn, "2026-03-01", "2026-04-01")
    summary = summarize(rows)
    assert summary["total_income"] == 3000
    assert summary["total_expenses"] == 900
    assert summary["net_cash_flow"] == 2100


def test_splits_are_used_for_summary_and_sankey():
    conn = _conn()
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
        VALUES ('2026-03-10', NULL, -100.00, 'EUR', NULL, 'Test Expense', NULL, NULL, NULL, 0, 'abc', ?, '{}', ?, ?)
        """,
        (import_job_id, now, now),
    )
    tx_id = conn.execute("SELECT id FROM transactions ORDER BY id DESC LIMIT 1").fetchone()["id"]
    food_id = conn.execute("SELECT id FROM categories WHERE name = 'Lebensmittel'").fetchone()["id"]
    rent_id = conn.execute("SELECT id FROM categories WHERE name = 'Miete'").fetchone()["id"]
    conn.executemany(
        """
        INSERT INTO transaction_splits(transaction_id, category_id, amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (tx_id, food_id, -40.0, now, now),
            (tx_id, rent_id, -60.0, now, now),
        ],
    )
    conn.commit()

    rows = list_transactions_for_period(conn, "2026-03-01", "2026-04-01")
    summary = summarize(rows)
    assert summary["total_expenses"] == 100.0
    assert summary["totals_by_category"] == [
        {"category": "Lebensmittel", "type": "expense", "total": 40.0},
        {"category": "Miete", "type": "expense", "total": 60.0},
    ]

    sankey = build_sankey(rows)
    assert {"source": "Net", "target": "Lebensmittel", "value": 40.0} in sankey["links"]
    assert {"source": "Net", "target": "Miete", "value": 60.0} in sankey["links"]


def test_import_applies_active_rules():
    conn = _conn()
    now = "2026-03-18T00:00:00+00:00"
    food_id = conn.execute("SELECT id FROM categories WHERE name = 'Lebensmittel'").fetchone()["id"]
    conn.execute(
        """
        INSERT INTO rules(
            name, match_field, match_type, match_value, category_id,
            exclude_transaction, priority, active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, 10, 1, ?, ?)
        """,
        ("Hofer to Food", "description", "contains", "hofer", food_id, now, now),
    )
    conn.commit()

    csv_bytes = (
        "booking_date,amount,description\n"
        "2026-03-01,-12.50,Hofer Einkauf\n"
        "2026-03-02,-9.20,Coffee Shop\n"
    ).encode("utf-8")
    mapping = {
        "booking_date": "booking_date",
        "amount": "amount",
        "description": "description",
    }

    result = execute_import(conn, "rules.csv", csv_bytes, mapping)
    assert result["imported_new"] == 2

    rows = conn.execute(
        "SELECT description, category_id FROM transactions ORDER BY id ASC"
    ).fetchall()
    assert rows[0]["description"] == "Hofer Einkauf"
    assert rows[0]["category_id"] == food_id
    assert rows[1]["description"] == "Coffee Shop"
    assert rows[1]["category_id"] is None


def test_excluded_splits_are_ignored_in_reporting():
    conn = _conn()
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
        VALUES ('2026-03-10', NULL, -100.00, 'EUR', NULL, 'Test Expense', NULL, NULL, NULL, 0, 'split-excl', ?, '{}', ?, ?)
        """,
        (import_job_id, now, now),
    )
    tx_id = conn.execute("SELECT id FROM transactions ORDER BY id DESC LIMIT 1").fetchone()["id"]
    food_id = conn.execute("SELECT id FROM categories WHERE name = 'Lebensmittel'").fetchone()["id"]
    rent_id = conn.execute("SELECT id FROM categories WHERE name = 'Miete'").fetchone()["id"]
    conn.executemany(
        """
        INSERT INTO transaction_splits(transaction_id, category_id, amount, excluded, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (tx_id, food_id, -40.0, 1, now, now),
            (tx_id, rent_id, -60.0, 0, now, now),
        ],
    )
    conn.commit()

    rows = list_transactions_for_period(conn, "2026-03-01", "2026-04-01")
    summary = summarize(rows)
    assert summary["total_expenses"] == 60.0
    assert summary["totals_by_category"] == [
        {"category": "Miete", "type": "expense", "total": 60.0},
    ]

    sankey = build_sankey(rows)
    assert {"source": "Net", "target": "Miete", "value": 60.0} in sankey["links"]
    assert {"source": "Net", "target": "Lebensmittel", "value": 40.0} not in sankey["links"]


def test_apply_rules_to_existing_only_updates_uncategorized():
    conn = _conn()
    now = "2026-03-18T00:00:00+00:00"
    food_id = conn.execute("SELECT id FROM categories WHERE name = 'Lebensmittel'").fetchone()["id"]
    rent_id = conn.execute("SELECT id FROM categories WHERE name = 'Miete'").fetchone()["id"]

    conn.execute(
        """
        INSERT INTO rules(
            name, match_field, match_type, match_value, category_id,
            exclude_transaction, priority, active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, 10, 1, ?, ?)
        """,
        ("Hofer to Food", "description", "contains", "hofer", food_id, now, now),
    )
    conn.execute(
        """
        INSERT INTO import_jobs(filename, column_mapping_json, row_count, new_row_count, duplicate_row_count, failed_row_count, imported_at)
        VALUES ('seed.csv', '{}', 3, 3, 0, 0, ?)
        """,
        (now,),
    )
    import_job_id = conn.execute("SELECT id FROM import_jobs ORDER BY id DESC LIMIT 1").fetchone()["id"]
    conn.executemany(
        """
        INSERT INTO transactions(
            booking_date, value_date, amount, currency, counterparty_name, description,
            raw_text, memo, category_id, excluded, dedupe_key, import_job_id, raw_data_json,
            created_at, updated_at
        )
        VALUES (?, NULL, ?, NULL, NULL, ?, NULL, NULL, ?, 0, ?, ?, '{}', ?, ?)
        """,
        [
            ("2026-03-03", -15.0, "Hofer Markt", None, "rule-1", import_job_id, now, now),
            ("2026-03-04", -25.0, "Hofer Already Categorized", rent_id, "rule-2", import_job_id, now, now),
            ("2026-03-05", -5.0, "Bakery", None, "rule-3", import_job_id, now, now),
        ],
    )
    conn.commit()

    summary = apply_active_rules_to_transactions(conn, only_uncategorized=True)
    assert summary["scanned_transactions"] == 2
    assert summary["matched_transactions"] == 1
    assert summary["updated_transactions"] == 1
    assert summary["categorized_transactions"] == 1

    rows = conn.execute("SELECT description, category_id FROM transactions ORDER BY id ASC").fetchall()
    assert rows[0]["description"] == "Hofer Markt"
    assert rows[0]["category_id"] == food_id
    assert rows[1]["description"] == "Hofer Already Categorized"
    assert rows[1]["category_id"] == rent_id
    assert rows[2]["description"] == "Bakery"
    assert rows[2]["category_id"] is None


def test_build_planning_dataset_uses_splits_and_returns_overview():
    conn = _conn()
    now = "2026-03-18T00:00:00+00:00"
    food_id = conn.execute("SELECT id FROM categories WHERE name = 'Lebensmittel'").fetchone()["id"]
    rent_id = conn.execute("SELECT id FROM categories WHERE name = 'Miete'").fetchone()["id"]

    conn.execute(
        """
        INSERT INTO import_jobs(filename, column_mapping_json, row_count, new_row_count, duplicate_row_count, failed_row_count, imported_at)
        VALUES ('planning.csv', '{}', 4, 4, 0, 0, ?)
        """,
        (now,),
    )
    import_job_id = conn.execute("SELECT id FROM import_jobs ORDER BY id DESC LIMIT 1").fetchone()["id"]
    conn.executemany(
        """
        INSERT INTO transactions(
            booking_date, value_date, amount, currency, counterparty_name, description,
            raw_text, memo, category_id, excluded, dedupe_key, import_job_id, raw_data_json,
            created_at, updated_at
        )
        VALUES (?, NULL, ?, 'EUR', NULL, ?, NULL, NULL, ?, ?, ?, ?, '{}', ?, ?)
        """,
        [
            ("2026-01-10", 3000.0, "Salary", None, 0, "plan-1", import_job_id, now, now),
            ("2026-01-15", -100.0, "Split Expense", None, 0, "plan-2", import_job_id, now, now),
            ("2026-02-03", -80.0, "Rent", rent_id, 0, "plan-3", import_job_id, now, now),
            ("2026-02-12", -40.0, "Excluded", food_id, 1, "plan-4", import_job_id, now, now),
        ],
    )

    split_tx_id = conn.execute(
        "SELECT id FROM transactions WHERE dedupe_key = 'plan-2'"
    ).fetchone()["id"]
    conn.executemany(
        """
        INSERT INTO transaction_splits(transaction_id, category_id, amount, excluded, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (split_tx_id, food_id, -30.0, 0, now, now),
            (split_tx_id, None, -70.0, 0, now, now),
        ],
    )
    conn.commit()

    payload = build_planning_dataset(conn, top_n_categories=6)
    overview = payload["overview"]
    assert overview["months_covered"] == 2
    assert overview["total_income"] == 3000.0
    assert overview["total_expenses"] == 180.0
    assert overview["net_cash_flow"] == 2820.0
    assert overview["total_transactions"] == 3

    month_rows = payload["monthly_totals"]
    assert month_rows[0]["month"] == "2026-01"
    assert month_rows[0]["expenses"] == 100.0
    assert month_rows[1]["month"] == "2026-02"
    assert month_rows[1]["expenses"] == 80.0

    categories = {row["category"]: row for row in payload["category_totals"]}
    assert categories["Lebensmittel"]["total_expenses"] == 30.0
    assert categories["Miete"]["total_expenses"] == 80.0
    assert categories["Ohne Kategorie"]["total_expenses"] == 70.0
