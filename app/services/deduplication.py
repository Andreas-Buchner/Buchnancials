import hashlib
from decimal import Decimal, ROUND_HALF_UP


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().lower().split())


def normalize_amount_for_key(amount: Decimal | float | str) -> str:
    dec = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{dec:.2f}"


def make_dedupe_key(booking_date_iso: str, amount: Decimal | float | str, description: str) -> str:
    key_material = "|".join(
        [
            normalize_text(booking_date_iso),
            normalize_amount_for_key(amount),
            normalize_text(description),
        ]
    )
    return hashlib.sha256(key_material.encode("utf-8")).hexdigest()

