import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from app.core.db import utc_now_iso
from app.services import categorization
from app.services.csv_preview import parse_csv
from app.services.deduplication import make_dedupe_key

REQUIRED_MAPPING_FIELDS = {"booking_date", "amount", "description"}
OPTIONAL_MAPPING_FIELDS = {"counterparty_name", "raw_text"}


@dataclass
class NormalizedTransaction:
    booking_date: str
    value_date: str | None
    amount: float
    currency: str | None
    counterparty_name: str | None
    description: str
    raw_text: str | None
    memo: str | None
    category_id: int | None
    excluded: bool
    dedupe_key: str
    raw_data_json: str


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().split())
    return cleaned or None


def _parse_date(value: str) -> str:
    value = value.strip()
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {value!r}")


def _parse_amount(value: str) -> Decimal:
    raw = value.strip().replace(" ", "")
    if not raw:
        raise ValueError("Amount is empty.")

    raw = raw.replace("€", "").replace("$", "").replace("CHF", "")
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")

    try:
        return Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount format: {value!r}") from exc


def validate_mapping(mapping: dict[str, str]) -> None:
    missing = [field for field in REQUIRED_MAPPING_FIELDS if not mapping.get(field)]
    if missing:
        raise ValueError(f"Missing required mappings: {', '.join(sorted(missing))}")


def _extract(raw_row: dict[str, str], mapping: dict[str, str], key: str) -> str | None:
    column = mapping.get(key)
    if not column:
        return None
    value = raw_row.get(column)
    return value.strip() if isinstance(value, str) else None


def _normalize_row(
    raw_row: dict[str, str],
    mapping: dict[str, str],
    active_rules: list[dict[str, Any]],
) -> NormalizedTransaction:
    booking_raw = _extract(raw_row, mapping, "booking_date") or ""
    amount_raw = _extract(raw_row, mapping, "amount") or ""
    description_raw = _extract(raw_row, mapping, "description")
    raw_text = _clean_text(_extract(raw_row, mapping, "raw_text"))

    description = _clean_text(description_raw) or raw_text
    if not description:
        raise ValueError("Description is empty after normalization.")

    booking_date = _parse_date(booking_raw)
    amount_decimal = _parse_amount(amount_raw)
    value_date = None
    currency = None
    counterparty_name = _clean_text(_extract(raw_row, mapping, "counterparty_name"))

    tx_for_rules = {
        "amount": float(amount_decimal),
        "description": description,
        "counterparty_name": counterparty_name,
        "raw_text": raw_text,
    }
    rule_result = categorization.apply_rules(tx_for_rules, active_rules)
    category_id = rule_result["category_id"]
    excluded = bool(rule_result["exclude_transaction"])

    dedupe_key = make_dedupe_key(
        booking_date_iso=booking_date,
        amount=amount_decimal,
        description=description,
    )

    return NormalizedTransaction(
        booking_date=booking_date,
        value_date=value_date,
        amount=float(amount_decimal),
        currency=currency,
        counterparty_name=counterparty_name,
        description=description,
        raw_text=raw_text,
        memo=None,
        category_id=category_id,
        excluded=excluded,
        dedupe_key=dedupe_key,
        raw_data_json=json.dumps(raw_row, ensure_ascii=False),
    )


def execute_import(
    conn: sqlite3.Connection,
    filename: str,
    file_bytes: bytes,
    mapping: dict[str, str],
    store_copy_path: Path | None = None,
) -> dict[str, Any]:
    validate_mapping(mapping)

    parsed = parse_csv(file_bytes)
    active_rules = categorization.load_active_rules(conn)
    now = utc_now_iso()

    if store_copy_path is not None:
        store_copy_path.parent.mkdir(parents=True, exist_ok=True)
        store_copy_path.write_bytes(file_bytes)

    cur = conn.execute(
        """
        INSERT INTO import_jobs(filename, column_mapping_json, row_count, new_row_count, duplicate_row_count, failed_row_count, imported_at)
        VALUES (?, ?, ?, 0, 0, 0, ?)
        """,
        (filename, json.dumps(mapping), len(parsed.rows), now),
    )
    import_job_id = cur.lastrowid

    inserted = 0
    duplicates = 0
    failed = 0
    failures: list[dict[str, Any]] = []

    for index, raw_row in enumerate(parsed.rows, start=1):
        try:
            normalized = _normalize_row(raw_row, mapping, active_rules)
            conn.execute(
                """
                INSERT INTO transactions(
                    booking_date, value_date, amount, currency, counterparty_name, description,
                    raw_text, memo, category_id, excluded, dedupe_key, import_job_id, raw_data_json,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized.booking_date,
                    normalized.value_date,
                    normalized.amount,
                    normalized.currency,
                    normalized.counterparty_name,
                    normalized.description,
                    normalized.raw_text,
                    normalized.memo,
                    normalized.category_id,
                    int(normalized.excluded),
                    normalized.dedupe_key,
                    import_job_id,
                    normalized.raw_data_json,
                    now,
                    now,
                ),
            )
            inserted += 1
        except sqlite3.IntegrityError as exc:
            if "dedupe_key" in str(exc):
                duplicates += 1
                continue
            failed += 1
            failures.append({"row_number": index, "error": str(exc)})
        except Exception as exc:
            failed += 1
            failures.append({"row_number": index, "error": str(exc)})

    conn.execute(
        """
        UPDATE import_jobs
        SET new_row_count = ?, duplicate_row_count = ?, failed_row_count = ?
        WHERE id = ?
        """,
        (inserted, duplicates, failed, import_job_id),
    )
    conn.commit()

    return {
        "import_job_id": import_job_id,
        "filename": filename,
        "row_count": len(parsed.rows),
        "imported_new": inserted,
        "ignored_duplicates": duplicates,
        "failed_rows": failed,
        "failures": failures[:20],
    }
