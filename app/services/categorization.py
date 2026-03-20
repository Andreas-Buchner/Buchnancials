import re
import sqlite3
from typing import Any

from app.core.db import utc_now_iso


ALLOWED_MATCH_TYPES = {"contains", "equals", "starts_with", "starts with", "regex"}
ALLOWED_FIELDS = {"description", "counterparty_name", "raw_text"}
ALLOWED_AMOUNT_SIGNS = {"any", "positive", "negative"}
ALLOWED_CONDITION_OPERATORS = {"and", "or"}


def normalize_match_type(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


NORMALIZED_ALLOWED_MATCH_TYPES = {normalize_match_type(match_type) for match_type in ALLOWED_MATCH_TYPES}


def load_active_rules(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          id,
          name,
          match_field,
          match_type,
          match_value,
          second_match_field,
          second_match_type,
          second_match_value,
          condition_operator,
          counterparty_filter,
          amount_sign,
          category_id,
          exclude_transaction,
          priority,
          active
        FROM rules
        WHERE active = 1
        ORDER BY priority ASC, id ASC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _match_rule(candidate: str, match_type: str, match_value: str) -> bool:
    left = (candidate or "").strip().lower()
    right = (match_value or "").strip().lower()
    if not right:
        return False

    match_type = normalize_match_type(match_type)
    if match_type == "contains":
        return right in left
    if match_type == "equals":
        return left == right
    if match_type == "starts_with":
        return left.startswith(right)
    if match_type == "regex":
        return re.search(match_value, candidate or "", flags=re.IGNORECASE) is not None
    return False


def _is_match_type_allowed(match_type: str | None) -> bool:
    return normalize_match_type(match_type or "") in NORMALIZED_ALLOWED_MATCH_TYPES


def _match_condition(transaction: dict[str, Any], match_field: str | None, match_type: str | None, match_value: str | None) -> bool:
    if not match_field or not match_type:
        return False
    if match_field not in ALLOWED_FIELDS:
        return False
    if not _is_match_type_allowed(match_type):
        return False
    candidate = (transaction.get(match_field) or "").strip()
    return _match_rule(candidate, match_type, match_value or "")


def apply_rules(transaction: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    for rule in rules:
        match_field = rule.get("match_field")
        match_type = rule.get("match_type")
        match_value = rule.get("match_value")
        second_match_field = rule.get("second_match_field")
        second_match_type = rule.get("second_match_type")
        second_match_value = rule.get("second_match_value")
        condition_operator = (rule.get("condition_operator") or "and").strip().lower()
        amount_sign = (rule.get("amount_sign") or "any").strip().lower()
        if amount_sign not in ALLOWED_AMOUNT_SIGNS:
            continue

        amount = float(transaction.get("amount") or 0.0)
        if amount_sign == "positive" and amount <= 0:
            continue
        if amount_sign == "negative" and amount >= 0:
            continue

        counterparty_filter = (rule.get("counterparty_filter") or "").strip().lower()
        if counterparty_filter:
            candidate_counterparty = (transaction.get("counterparty_name") or "").strip().lower()
            if counterparty_filter not in candidate_counterparty:
                continue

        primary_match = _match_condition(transaction, match_field, match_type, match_value)
        has_secondary = bool(
            (second_match_field or "").strip() and (second_match_type or "").strip() and (second_match_value or "").strip()
        )
        if has_secondary:
            secondary_match = _match_condition(transaction, second_match_field, second_match_type, second_match_value)
            if condition_operator not in ALLOWED_CONDITION_OPERATORS:
                condition_operator = "and"
            matched = (primary_match and secondary_match) if condition_operator == "and" else (primary_match or secondary_match)
        else:
            matched = primary_match

        if matched:
            return {
                "matched_rule_id": rule["id"],
                "category_id": rule.get("category_id"),
                "exclude_transaction": bool(rule.get("exclude_transaction")),
            }
    return {"matched_rule_id": None, "category_id": None, "exclude_transaction": False}


def apply_active_rules_to_transactions(
    conn: sqlite3.Connection,
    *,
    only_uncategorized: bool = True,
) -> dict[str, int]:
    active_rules = load_active_rules(conn)
    if not active_rules:
        return {
            "active_rule_count": 0,
            "scanned_transactions": 0,
            "matched_transactions": 0,
            "updated_transactions": 0,
            "categorized_transactions": 0,
            "excluded_transactions": 0,
        }

    where_clause = "WHERE t.category_id IS NULL" if only_uncategorized else ""
    rows = conn.execute(
        f"""
        SELECT
          t.id,
          t.amount,
          t.description,
          t.counterparty_name,
          t.raw_text,
          t.category_id,
          t.excluded
        FROM transactions t
        {where_clause}
        ORDER BY t.id ASC
        """
    ).fetchall()

    matched = 0
    updated = 0
    categorized = 0
    excluded = 0
    now = utc_now_iso()

    for row in rows:
        row_dict = dict(row)
        result = apply_rules(row_dict, active_rules)
        if result["matched_rule_id"] is None:
            continue
        matched += 1

        fields: list[str] = []
        values: list[Any] = []

        category_id = result.get("category_id")
        if category_id is not None and row_dict["category_id"] != category_id:
            fields.append("category_id = ?")
            values.append(int(category_id))
            categorized += 1

        if bool(result.get("exclude_transaction")) and not bool(row_dict["excluded"]):
            fields.append("excluded = 1")
            excluded += 1

        if not fields:
            continue

        fields.append("updated_at = ?")
        values.append(now)
        values.append(row_dict["id"])
        conn.execute(f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?", values)
        updated += 1

    conn.commit()
    return {
        "active_rule_count": len(active_rules),
        "scanned_transactions": len(rows),
        "matched_transactions": matched,
        "updated_transactions": updated,
        "categorized_transactions": categorized,
        "excluded_transactions": excluded,
    }
