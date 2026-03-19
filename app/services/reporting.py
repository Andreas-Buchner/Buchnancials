import sqlite3
from collections import defaultdict
from datetime import date
from statistics import median
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


def list_all_transactions(conn: sqlite3.Connection) -> list[dict[str, Any]]:
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
        ORDER BY t.booking_date ASC, t.id ASC
        """
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


def _row_components(row: dict[str, Any]) -> list[dict[str, Any]]:
    split_items = row.get("splits") or []
    if split_items:
        return [
            {
                "amount": float(split["amount"]),
                "category_name": split.get("category_name"),
                "category_type": split.get("category_type"),
                "excluded": bool(split.get("excluded")),
            }
            for split in split_items
        ]
    return [
        {
            "amount": float(row["amount"]),
            "category_name": row.get("category_name"),
            "category_type": row.get("category_type"),
            "excluded": False,
        }
    ]


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    income = 0.0
    expenses = 0.0
    by_category: dict[str, float] = defaultdict(float)
    category_type: dict[str, str] = {}

    for row in rows:
        if row["excluded"]:
            continue

        components = _row_components(row)

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


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    ordered = sorted(values)
    rank = (len(ordered) - 1) * max(0.0, min(100.0, pct)) / 100.0
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    if low == high:
        return float(ordered[low])
    frac = rank - low
    return float(ordered[low] + (ordered[high] - ordered[low]) * frac)


def build_planning_dataset(conn: sqlite3.Connection, top_n_categories: int = 8) -> dict[str, Any]:
    rows = list_all_transactions(conn)
    if not rows:
        return {
            "overview": {
                "months_covered": 0,
                "first_month": None,
                "last_month": None,
                "total_transactions": 0,
                "total_income": 0.0,
                "total_expenses": 0.0,
                "net_cash_flow": 0.0,
                "average_monthly_expenses": 0.0,
                "median_monthly_expenses": 0.0,
                "p90_monthly_expenses": 0.0,
            },
            "monthly_totals": [],
            "category_totals": [],
            "violin_series": [],
            "stacked_bar": {"months": [], "series": []},
        }

    monthly_totals: dict[str, dict[str, float]] = {}
    category_monthly_spending: dict[str, dict[str, float]] = defaultdict(dict)
    category_totals: dict[str, float] = defaultdict(float)

    included_tx_count = 0
    for row in rows:
        if row["excluded"]:
            continue
        included_tx_count += 1
        month_key = str(row["booking_date"])[:7]
        bucket = monthly_totals.setdefault(month_key, {"income": 0.0, "expenses": 0.0})

        for component in _row_components(row):
            if component["excluded"]:
                continue
            amount = float(component["amount"])
            if amount >= 0:
                bucket["income"] += amount
            else:
                expense_value = abs(amount)
                bucket["expenses"] += expense_value
                category = component.get("category_name") or "Ohne Kategorie"
                category_totals[category] += expense_value
                category_month = category_monthly_spending[category]
                category_month[month_key] = category_month.get(month_key, 0.0) + expense_value

    months = sorted(monthly_totals.keys())
    monthly_totals_list: list[dict[str, Any]] = []
    monthly_expenses: list[float] = []
    overall_income = 0.0
    overall_expenses = 0.0
    for month in months:
        income = round(monthly_totals[month]["income"], 2)
        expenses = round(monthly_totals[month]["expenses"], 2)
        net = round(income - expenses, 2)
        overall_income += income
        overall_expenses += expenses
        monthly_expenses.append(expenses)
        monthly_totals_list.append({"month": month, "income": income, "expenses": expenses, "net": net})

    total_net = round(overall_income - overall_expenses, 2)

    sorted_categories = sorted(category_totals.items(), key=lambda item: item[1], reverse=True)
    top_n = max(3, min(int(top_n_categories), 20))
    top_categories = [name for name, _ in sorted_categories[:top_n]]

    violin_series: list[dict[str, Any]] = []
    for category in top_categories:
        monthly_values = [round(category_monthly_spending[category].get(month, 0.0), 2) for month in months]
        non_zero = [value for value in monthly_values if value > 0]
        if not non_zero:
            continue
        violin_series.append({"category": category, "values": non_zero})

    stacked_series: list[dict[str, Any]] = []
    for category in top_categories:
        values = [round(category_monthly_spending[category].get(month, 0.0), 2) for month in months]
        if any(value > 0 for value in values):
            stacked_series.append({"category": category, "values": values})

    other_categories = [name for name in category_monthly_spending.keys() if name not in set(top_categories)]
    if other_categories and months:
        other_values: list[float] = []
        for month in months:
            total_for_month = 0.0
            for category in other_categories:
                total_for_month += category_monthly_spending[category].get(month, 0.0)
            other_values.append(round(total_for_month, 2))
        if any(value > 0 for value in other_values):
            stacked_series.append({"category": "Andere", "values": other_values})

    category_totals_payload: list[dict[str, Any]] = []
    for category, total in sorted_categories:
        active_months = len([v for v in category_monthly_spending[category].values() if v > 0])
        avg_monthly = total / active_months if active_months > 0 else 0.0
        category_totals_payload.append(
            {
                "category": category,
                "total_expenses": round(total, 2),
                "active_months": active_months,
                "average_active_monthly": round(avg_monthly, 2),
            }
        )

    return {
        "overview": {
            "months_covered": len(months),
            "first_month": months[0] if months else None,
            "last_month": months[-1] if months else None,
            "total_transactions": included_tx_count,
            "total_income": round(overall_income, 2),
            "total_expenses": round(overall_expenses, 2),
            "net_cash_flow": total_net,
            "average_monthly_expenses": round(sum(monthly_expenses) / len(monthly_expenses), 2) if monthly_expenses else 0.0,
            "median_monthly_expenses": round(float(median(monthly_expenses)), 2) if monthly_expenses else 0.0,
            "p90_monthly_expenses": round(_percentile(monthly_expenses, 90), 2) if monthly_expenses else 0.0,
        },
        "monthly_totals": monthly_totals_list,
        "category_totals": category_totals_payload,
        "violin_series": violin_series,
        "stacked_bar": {"months": months, "series": stacked_series},
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
