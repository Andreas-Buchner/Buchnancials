import sqlite3

from fastapi import APIRouter, HTTPException, Query

from app.core.db import get_connection, utc_now_iso
from app.models.category import CategoryCreate, CategoryPatch

router = APIRouter(tags=["categories"])


@router.get("/categories")
def get_categories(include_inactive: bool = Query(default=True)) -> list[dict]:
    with get_connection() as conn:
        if include_inactive:
            rows = conn.execute(
                "SELECT id, name, type, active, created_at, updated_at FROM categories ORDER BY type, name"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, name, type, active, created_at, updated_at FROM categories WHERE active = 1 ORDER BY type, name"
            ).fetchall()
    return [dict(row) for row in rows]


@router.post("/categories")
def create_category(payload: CategoryCreate) -> dict:
    if payload.type not in {"income", "expense"}:
        raise HTTPException(status_code=400, detail="Category type must be income or expense.")

    now = utc_now_iso()
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO categories(name, type, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.name.strip(), payload.type, int(payload.active), now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, name, type, active, created_at, updated_at FROM categories WHERE id = ?",
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

    fields = []
    values = []
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        if isinstance(value, bool):
            values.append(int(value))
        elif isinstance(value, str):
            values.append(value.strip())
        else:
            values.append(value)

    fields.append("updated_at = ?")
    values.append(utc_now_iso())
    values.append(category_id)

    with get_connection() as conn:
        try:
            cur = conn.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Category not found.")
            conn.commit()
            row = conn.execute(
                "SELECT id, name, type, active, created_at, updated_at FROM categories WHERE id = ?",
                (category_id,),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return dict(row)

