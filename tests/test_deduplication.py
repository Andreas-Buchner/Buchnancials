from app.services.deduplication import make_dedupe_key


def test_dedupe_key_is_stable_for_equivalent_values():
    left = make_dedupe_key("2026-03-01", "10.00", "  Grocery Store ")
    right = make_dedupe_key("2026-03-01", 10, "grocery    store")
    assert left == right


def test_dedupe_key_changes_when_description_changes():
    left = make_dedupe_key("2026-03-01", "10.00", "Grocery Store")
    right = make_dedupe_key("2026-03-01", "10.00", "Rent")
    assert left != right

