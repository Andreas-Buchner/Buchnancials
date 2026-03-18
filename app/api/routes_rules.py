import sqlite3

from fastapi import APIRouter, HTTPException, Query

from app.core.db import get_connection, utc_now_iso
from app.models.rule import RuleCreate, RulePatch
from app.services.categorization import (
    ALLOWED_AMOUNT_SIGNS,
    ALLOWED_FIELDS,
    ALLOWED_MATCH_TYPES,
    apply_active_rules_to_transactions,
    normalize_match_type,
)

router = APIRouter(tags=["rules"])


def _validate_rule_payload(match_field: str, match_type: str, amount_sign: str) -> None:
    if match_field not in ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail=f"Invalid match_field: {match_field}")
    if normalize_match_type(match_type) not in {normalize_match_type(t) for t in ALLOWED_MATCH_TYPES}:
        raise HTTPException(status_code=400, detail=f"Invalid match_type: {match_type}")
    normalized_amount_sign = (amount_sign or "any").strip().lower()
    if normalized_amount_sign not in ALLOWED_AMOUNT_SIGNS:
        raise HTTPException(status_code=400, detail=f"Invalid amount_sign: {amount_sign}")


@router.get("/rules")
def get_rules() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              r.id,
              r.name,
              r.match_field,
              r.match_type,
              r.match_value,
              r.counterparty_filter,
              r.amount_sign,
              r.category_id,
              r.exclude_transaction,
              r.priority,
              r.active,
              r.created_at,
              r.updated_at,
              c.name AS category_name
            FROM rules r
            LEFT JOIN categories c ON c.id = r.category_id
            ORDER BY r.priority, r.id
            """
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/rules")
def create_rule(payload: RuleCreate) -> dict:
    _validate_rule_payload(payload.match_field, payload.match_type, payload.amount_sign)
    now = utc_now_iso()
    with get_connection() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO rules(
                  name, match_field, match_type, match_value, counterparty_filter, amount_sign, category_id,
                  exclude_transaction, priority, active, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.match_field,
                    normalize_match_type(payload.match_type),
                    payload.match_value,
                    payload.counterparty_filter.strip() if payload.counterparty_filter else None,
                    payload.amount_sign.strip().lower(),
                    payload.category_id,
                    int(payload.exclude_transaction),
                    payload.priority,
                    int(payload.active),
                    now,
                    now,
                ),
            )
            conn.commit()
            row = conn.execute(
                """
                SELECT
                  id, name, match_field, match_type, match_value, counterparty_filter, amount_sign,
                  category_id, exclude_transaction, priority, active, created_at, updated_at
                FROM rules
                WHERE id = ?
                """,
                (cur.lastrowid,),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return dict(row)


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: int, payload: RulePatch) -> dict:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    if "match_field" in updates or "match_type" in updates or "amount_sign" in updates:
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT match_field, match_type, amount_sign FROM rules WHERE id = ?",
                (rule_id,),
            ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Rule not found.")
        _validate_rule_payload(
            updates.get("match_field", existing["match_field"]),
            updates.get("match_type", existing["match_type"]),
            updates.get("amount_sign", existing["amount_sign"]),
        )

    fields = []
    values = []
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        if key == "match_type" and isinstance(value, str):
            values.append(normalize_match_type(value))
        elif key == "amount_sign" and isinstance(value, str):
            values.append(value.strip().lower())
        elif key == "counterparty_filter" and isinstance(value, str):
            values.append(value.strip() or None)
        elif isinstance(value, bool):
            values.append(int(value))
        elif isinstance(value, str):
            values.append(value.strip())
        else:
            values.append(value)

    fields.append("updated_at = ?")
    values.append(utc_now_iso())
    values.append(rule_id)

    with get_connection() as conn:
        try:
            cur = conn.execute(f"UPDATE rules SET {', '.join(fields)} WHERE id = ?", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Rule not found.")
            conn.commit()
            row = conn.execute(
                """
                SELECT
                  id, name, match_field, match_type, match_value, counterparty_filter, amount_sign,
                  category_id, exclude_transaction, priority, active, created_at, updated_at
                FROM rules
                WHERE id = ?
                """,
                (rule_id,),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return dict(row)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int) -> dict:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Rule not found.")
        conn.commit()
    return {"deleted": True, "id": rule_id}


@router.post("/rules/apply")
def apply_rules_to_existing_transactions(
    only_uncategorized: bool = Query(True),
) -> dict:
    with get_connection() as conn:
        summary = apply_active_rules_to_transactions(conn, only_uncategorized=only_uncategorized)
    return summary
