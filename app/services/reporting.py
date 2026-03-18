import sqlite3
from collections import defaultdict
from datetime import date
from typing import Any


def month_bounds(year: int, month: int) -> tuple[str, str]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start.isoformat(), end.isoformat()


def quarter_bounds(year: int, quarter: int) -> tuple[str, str]:
    start_month = (quarter - 1) * 3 + 1
    start = date(year, start_month, 1)
    if quarter == 4:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, start_month + 3, 1)
    return start.isoformat(), end.isoformat()


def year_bounds(year: int) -> tuple[str, str]:
    return date(year, 1, 1).isoformat(), date(year + 1, 1, 1).isoformat()


def list_transactions_for_period(conn: sqlite3.Connection, start_date: str, end_date: str) -> list[dict[str, Any]]:
    raw_rows = conn.execute(
        """
        SELECT
          t.id,
          t.booking_date,
          t.value_date,
          t.amount,
          t.currency,
          t.counterparty_name,
          t.description,
          t.raw_text,
          t.memo,
          t.category_id,
          t.excluded,
          t.dedupe_key,
          t.import_job_id,
          t.raw_data_json,
          t.created_at,
          t.updated_at,
          c.name AS category_name,
          c.type AS category_type,
          c.color AS category_color
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.booking_date >= ? AND t.booking_date < ?
        ORDER BY t.booking_date DESC, t.id DESC
        """,
        (start_date, end_date),
    ).fetchall()
    rows = [dict(row) for row in raw_rows]
    attach_splits(conn, rows)
    return rows


def attach_splits(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    tx_ids = [row["id"] for row in rows if "id" in row]
    if not tx_ids:
        return

    placeholders = ",".join("?" for _ in tx_ids)
    split_rows = conn.execute(
        f"""
        SELECT
          ts.id,
          ts.transaction_id,
          ts.category_id,
          ts.amount,
          ts.excluded,
          ts.created_at,
          ts.updated_at,
          c.name AS category_name,
          c.type AS category_type,
          c.color AS category_color
        FROM transaction_splits ts
        LEFT JOIN categories c ON c.id = ts.category_id
        WHERE ts.transaction_id IN ({placeholders})
        ORDER BY ts.id ASC
        """,
        tx_ids,
    ).fetchall()

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for split in split_rows:
        split_dict = dict(split)
        grouped[split["transaction_id"]].append(split_dict)

    for row in rows:
        row["splits"] = grouped.get(row["id"], [])


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    income = 0.0
    expenses = 0.0
    by_category: dict[str, float] = defaultdict(float)
    category_type: dict[str, str] = {}

    for row in rows:
        if row["excluded"]:
            continue

        split_items = row.get("splits") or []
        if split_items:
            components = [
                {
                    "amount": float(split["amount"]),
                    "category_name": split.get("category_name"),
                    "category_type": split.get("category_type"),
                    "excluded": bool(split.get("excluded")),
                }
                for split in split_items
            ]
        else:
            components = [
                {
                    "amount": float(row["amount"]),
                    "category_name": row.get("category_name"),
                    "category_type": row.get("category_type"),
                    "excluded": False,
                }
            ]

        for component in components:
            if component["excluded"]:
                continue
            amount = float(component["amount"])
            if amount >= 0:
                income += amount
            else:
                expenses += abs(amount)

            category_name = component.get("category_name") or "Uncategorized"
            category_type[category_name] = component.get("category_type") or ("income" if amount >= 0 else "expense")
            by_category[category_name] += amount

    category_totals = []
    for name, value in by_category.items():
        row_type = category_type.get(name, "expense")
        display_total = value if row_type == "income" else abs(value)
        category_totals.append({"category": name, "type": row_type, "total": round(display_total, 2)})

    category_totals.sort(key=lambda item: (item["type"], item["category"].lower()))
    net = income - expenses
    return {
        "total_income": round(income, 2),
        "total_expenses": round(expenses, 2),
        "net_cash_flow": round(net, 2),
        "totals_by_category": category_totals,
    }


def list_categories(conn: sqlite3.Connection, include_inactive: bool = True) -> list[dict[str, Any]]:
    if include_inactive:
        rows = conn.execute(
            """
            SELECT id, name, type, color, active
            FROM categories
            ORDER BY type, active DESC, name
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, name, type, color, active
            FROM categories
            WHERE active = 1
            ORDER BY type, name
            """
        ).fetchall()
    return [dict(row) for row in rows]


def build_grouped_transactions(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    raw_rows = conn.execute(
        """
        SELECT
          t.id,
          t.booking_date,
          t.amount,
          t.description,
          t.counterparty_name,
          t.memo,
          t.category_id,
          t.excluded,
          c.name AS category_name,
          c.type AS category_type,
          c.color AS category_color
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        ORDER BY t.booking_date DESC, t.id DESC
        """
    ).fetchall()
    rows = [dict(row) for row in raw_rows]
    attach_splits(conn, rows)

    grouped: dict[int, dict[str, Any]] = {}
    for row in rows:
        booking_date = row["booking_date"]
        year = int(booking_date[:4])
        month = int(booking_date[5:7])
        quarter = ((month - 1) // 3) + 1
        row_dict = row

        year_bucket = grouped.setdefault(year, {"year": year, "quarters": {}})
        quarter_bucket = year_bucket["quarters"].setdefault(quarter, {"quarter": quarter, "months": {}})
        month_bucket = quarter_bucket["months"].setdefault(month, {"month": month, "transactions": []})
        month_bucket["transactions"].append(row_dict)

    years = []
    for year in sorted(grouped.keys(), reverse=True):
        year_bucket = grouped[year]
        quarter_list = []
        for quarter in sorted(year_bucket["quarters"].keys(), reverse=True):
            quarter_bucket = year_bucket["quarters"][quarter]
            months = [quarter_bucket["months"][m] for m in sorted(quarter_bucket["months"].keys(), reverse=True)]
            quarter_list.append({"quarter": quarter, "months": months})
        years.append({"year": year, "quarters": quarter_list})
    return years
