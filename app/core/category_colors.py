from __future__ import annotations

import sqlite3

CATEGORY_COLOR_PALETTES: dict[str, tuple[str, ...]] = {
    "expense": (
        "#7f0000",
        "#ff3b30",
        "#a30015",
        "#ff6b6b",
        "#b34700",
        "#ff9500",
        "#8c2f00",
        "#ffb347",
        "#6a040f",
        "#ff1744",
        "#9d0208",
        "#f9844a",
        "#c1121f",
        "#ffd166",
        "#e65100",
        "#f94144",
        "#5f0f40",
        "#f3722c",
        "#b5651d",
        "#ffe066",
    ),
    "income": (
        "#0b6e4f",
        "#2ecc71",
        "#14532d",
        "#84cc16",
        "#0f766e",
        "#2dd4bf",
        "#006d77",
        "#00b4d8",
        "#1d4ed8",
        "#60a5fa",
        "#1e3a8a",
        "#7c3aed",
        "#6b7280",
        "#4b5563",
        "#8b5e34",
        "#a16207",
        "#3f6212",
        "#14b8a6",
        "#5c7cfa",
        "#3b7a57",
    ),
}


def next_category_color(conn: sqlite3.Connection, category_type: str) -> str:
    palette = CATEGORY_COLOR_PALETTES.get(category_type)
    if not palette:
        raise ValueError(f"Unsupported category type: {category_type}")

    count = conn.execute(
        "SELECT COUNT(*) AS cnt FROM categories WHERE type = ?",
        (category_type,),
    ).fetchone()["cnt"]
    return palette[count % len(palette)]
