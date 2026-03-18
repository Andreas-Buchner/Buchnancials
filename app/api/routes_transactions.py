import sqlite3
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.db import get_connection, utc_now_iso
from app.models.transaction import TransactionBatchPatch, TransactionPatch, TransactionSplitUpdate
from app.services.reporting import list_transactions_for_period, month_bounds

router = APIRouter(tags=["transactions"])


def _fetch_transaction(conn: sqlite3.Connection, tx_id: int) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT t.*, c.name AS category_name, c.type AS category_type
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = ?
        """,
        (tx_id,),
    ).fetchone()
    return dict(row) if row else None


@router.get("/transactions")
def list_transactions(year: int = Query(...), month: int = Query(..., ge=1, le=12)) -> list[dict]:
    start, end = month_bounds(year, month)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return rows


@router.patch("/transactions/batch")
def patch_transactions_batch(payload: TransactionBatchPatch) -> dict:
    if not payload.updates:
        raise HTTPException(status_code=400, detail="No updates provided.")

    updated_ids: list[int] = []
    errors: list[dict] = []

    with get_connection() as conn:
        for update in payload.updates:
            updates = update.model_dump(exclude={"id"}, exclude_unset=True)
            tx_id = update.id
            if not updates:
                continue

            fields = []
            values = []
            for key, value in updates.items():
                fields.append(f"{key} = ?")
                if isinstance(value, bool):
                    values.append(int(value))
                else:
                    values.append(value)
            fields.append("updated_at = ?")
            values.append(utc_now_iso())
            values.append(tx_id)

            try:
                cur = conn.execute(f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?", values)
                if cur.rowcount == 0:
                    errors.append({"id": tx_id, "error": "Transaction not found."})
                else:
                    updated_ids.append(tx_id)
            except sqlite3.IntegrityError as exc:
                errors.append({"id": tx_id, "error": str(exc)})

        conn.commit()

    return {"updated_count": len(updated_ids), "updated_ids": updated_ids, "errors": errors}


@router.get("/transactions/{transaction_id}/splits")
def get_transaction_splits(transaction_id: int) -> dict:
    with get_connection() as conn:
        tx = conn.execute("SELECT id, amount FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if tx is None:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        split_rows = conn.execute(
            """
            SELECT
              ts.id,
              ts.transaction_id,
              ts.category_id,
              ts.amount,
              ts.excluded,
              c.name AS category_name,
              c.type AS category_type,
              c.color AS category_color
            FROM transaction_splits ts
            LEFT JOIN categories c ON c.id = ts.category_id
            WHERE ts.transaction_id = ?
            ORDER BY ts.id
            """,
            (transaction_id,),
        ).fetchall()
    return {"transaction_id": transaction_id, "transaction_amount": tx["amount"], "splits": [dict(row) for row in split_rows]}


@router.put("/transactions/{transaction_id}/splits")
def replace_transaction_splits(transaction_id: int, payload: TransactionSplitUpdate) -> dict:
    with get_connection() as conn:
        tx = conn.execute("SELECT id, amount FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if tx is None:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        tx_amount = round(float(tx["amount"]), 2)
        split_total = round(sum(float(split.amount) for split in payload.splits), 2)
        if payload.splits and abs(split_total - tx_amount) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Split total ({split_total:.2f}) must equal transaction amount ({tx_amount:.2f}).",
            )

        category_ids = {split.category_id for split in payload.splits}
        if category_ids:
            placeholders = ",".join("?" for _ in category_ids)
            existing = conn.execute(
                f"SELECT id FROM categories WHERE id IN ({placeholders})",
                tuple(category_ids),
            ).fetchall()
            if len(existing) != len(category_ids):
                raise HTTPException(status_code=400, detail="One or more split categories do not exist.")

        now = utc_now_iso()
        conn.execute("DELETE FROM transaction_splits WHERE transaction_id = ?", (transaction_id,))
        for split in payload.splits:
            conn.execute(
                """
                INSERT INTO transaction_splits(transaction_id, category_id, amount, excluded, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (transaction_id, split.category_id, float(split.amount), int(bool(split.excluded)), now, now),
            )
        conn.execute("UPDATE transactions SET updated_at = ? WHERE id = ?", (now, transaction_id))
        conn.commit()

    return {"transaction_id": transaction_id, "split_count": len(payload.splits)}


@router.patch("/transactions/{transaction_id}")
def patch_transaction(transaction_id: int, payload: TransactionPatch) -> dict:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    fields = []
    values = []
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        if isinstance(value, bool):
            values.append(int(value))
        else:
            values.append(value)

    fields.append("updated_at = ?")
    values.append(utc_now_iso())
    values.append(transaction_id)

    with get_connection() as conn:
        try:
            cur = conn.execute(f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Transaction not found.")
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        updated = _fetch_transaction(conn, transaction_id)
    return updated
