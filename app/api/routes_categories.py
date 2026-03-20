import sqlite3

from fastapi import APIRouter, HTTPException

from app.core.category_colors import next_category_color
from app.core.db import get_connection, utc_now_iso
from app.models.category import CategoryCreate, CategoryPatch

router = APIRouter(tags=["categories"])


def _normalize_color(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not cleaned.startswith("#"):
        cleaned = f"#{cleaned}"
    if len(cleaned) != 7:
        raise HTTPException(status_code=400, detail="Category color must be in #RRGGBB format.")
    try:
        int(cleaned[1:], 16)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Category color must be valid hex (#RRGGBB).") from exc
    return cleaned.lower()


def _normalize_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Category name must not be empty.")
    return cleaned


def _category_name_exists(
    conn: sqlite3.Connection,
    name: str,
    category_type: str,
    exclude_id: int | None = None,
) -> bool:
    params: list[object] = [name, category_type]
    sql = "SELECT 1 FROM categories WHERE LOWER(TRIM(name)) = LOWER(?) AND type = ?"
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    sql += " LIMIT 1"
    return conn.execute(sql, params).fetchone() is not None


@router.get("/categories")
def get_categories() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, type, color, created_at, updated_at FROM categories ORDER BY type, name"
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/categories")
def create_category(payload: CategoryCreate) -> dict:
    if payload.type not in {"income", "expense"}:
        raise HTTPException(status_code=400, detail="Category type must be income or expense.")

    normalized_name = _normalize_name(payload.name)
    now = utc_now_iso()
    with get_connection() as conn:
        if _category_name_exists(conn, normalized_name, payload.type):
            raise HTTPException(status_code=400, detail="Category name already exists.")

        color = _normalize_color(payload.color)
        if color is None:
            color = next_category_color(conn, payload.type)

        cur = conn.execute(
            """
            INSERT INTO categories(name, type, color, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (normalized_name, payload.type, color, 1, now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, name, type, color, created_at, updated_at FROM categories WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(row)


@router.patch("/categories/{category_id}")
def update_category(category_id: int, payload: CategoryPatch) -> dict:
    if payload.type is not None and payload.type not in {"income", "expense"}:
        raise HTTPException(status_code=400, detail="Category type must be income or expense.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update.")

    with get_connection() as conn:
        try:
            existing = conn.execute(
                "SELECT id, name, type FROM categories WHERE id = ?",
                (category_id,),
            ).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Category not found.")

            target_type = str(existing["type"]).strip()
            if "type" in updates:
                if not isinstance(updates["type"], str):
                    raise HTTPException(status_code=400, detail="Category type must be income or expense.")
                target_type = updates["type"].strip()
                if target_type not in {"income", "expense"}:
                    raise HTTPException(status_code=400, detail="Category type must be income or expense.")
                updates["type"] = target_type

            target_name = str(existing["name"]).strip()
            if "name" in updates:
                if not isinstance(updates["name"], str):
                    raise HTTPException(status_code=400, detail="Category name must be a string.")
                normalized_name = _normalize_name(updates["name"])
                updates["name"] = normalized_name
                target_name = normalized_name

            if _category_name_exists(conn, target_name, target_type, exclude_id=category_id):
                raise HTTPException(status_code=400, detail="Category name already exists.")

            fields = []
            values = []
            for key, value in updates.items():
                fields.append(f"{key} = ?")
                if key == "color":
                    values.append(_normalize_color(value) if isinstance(value, str) else value)
                elif key == "type":
                    values.append(value.strip())
                elif isinstance(value, str):
                    values.append(value.strip())
                else:
                    values.append(value)

            fields.append("updated_at = ?")
            values.append(utc_now_iso())
            values.append(category_id)

            cur = conn.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Category not found.")
            conn.commit()
            row = conn.execute(
                "SELECT id, name, type, color, created_at, updated_at FROM categories WHERE id = ?",
                (category_id,),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return dict(row)


@router.get("/categories/{category_id}/usage")
def get_category_usage(category_id: int) -> dict:
    with get_connection() as conn:
        category = conn.execute(
            "SELECT id, name, type FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found.")

        direct_transactions = conn.execute(
            "SELECT COUNT(*) AS cnt FROM transactions WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]
        split_lines = conn.execute(
            "SELECT COUNT(*) AS cnt FROM transaction_splits WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]
        affected_transactions = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM (
              SELECT t.id
              FROM transactions t
              WHERE t.category_id = ?
              UNION
              SELECT ts.transaction_id
              FROM transaction_splits ts
              WHERE ts.category_id = ?
            ) used
            """,
            (category_id, category_id),
        ).fetchone()["cnt"]
        linked_rules = conn.execute(
            "SELECT COUNT(*) AS cnt FROM rules WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]

    return {
        "category_id": category_id,
        "category_name": category["name"],
        "category_type": category["type"],
        "direct_transactions": direct_transactions,
        "split_lines": split_lines,
        "affected_transactions": affected_transactions,
        "linked_rules": linked_rules,
    }


@router.delete("/categories/{category_id}")
def delete_category(category_id: int) -> dict:
    now = utc_now_iso()
    with get_connection() as conn:
        category = conn.execute(
            "SELECT id, name, type FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found.")

        direct_transactions = conn.execute(
            "SELECT COUNT(*) AS cnt FROM transactions WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]
        split_lines = conn.execute(
            "SELECT COUNT(*) AS cnt FROM transaction_splits WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]
        affected_transactions = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM (
              SELECT t.id
              FROM transactions t
              WHERE t.category_id = ?
              UNION
              SELECT ts.transaction_id
              FROM transaction_splits ts
              WHERE ts.category_id = ?
            ) used
            """,
            (category_id, category_id),
        ).fetchone()["cnt"]
        linked_rules = conn.execute(
            "SELECT COUNT(*) AS cnt FROM rules WHERE category_id = ?",
            (category_id,),
        ).fetchone()["cnt"]

        conn.execute(
            "UPDATE transactions SET category_id = NULL, updated_at = ? WHERE category_id = ?",
            (now, category_id),
        )
        conn.execute(
            "UPDATE transaction_splits SET category_id = NULL, updated_at = ? WHERE category_id = ?",
            (now, category_id),
        )
        conn.execute(
            "UPDATE rules SET category_id = NULL, updated_at = ? WHERE category_id = ?",
            (now, category_id),
        )
        cur = conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Category not found.")
        conn.commit()

    return {
        "deleted": True,
        "id": category_id,
        "name": category["name"],
        "type": category["type"],
        "direct_transactions": direct_transactions,
        "split_lines": split_lines,
        "affected_transactions": affected_transactions,
        "linked_rules": linked_rules,
    }
