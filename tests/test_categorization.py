from app.services.categorization import apply_rules


def test_apply_rules_matches_contains_in_priority_order():
    rules = [
        {
            "id": 1,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "salary",
            "category_id": 5,
            "exclude_transaction": 0,
        },
        {
            "id": 2,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "month",
            "category_id": 9,
            "exclude_transaction": 1,
        },
    ]
    result = apply_rules({"description": "Monthly Salary Payment"}, rules)
    assert result["matched_rule_id"] == 1
    assert result["category_id"] == 5
    assert result["exclude_transaction"] is False


def test_apply_rules_supports_regex():
    rules = [
        {
            "id": 10,
            "match_field": "raw_text",
            "match_type": "regex",
            "match_value": r"^internal transfer",
            "category_id": None,
            "exclude_transaction": 1,
        }
    ]
    result = apply_rules({"raw_text": "Internal Transfer Savings"}, rules)
    assert result["matched_rule_id"] == 10
    assert result["exclude_transaction"] is True


def test_apply_rules_supports_counterparty_and_amount_sign_filters():
    rules = [
        {
            "id": 11,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "hofer",
            "counterparty_filter": "hofer",
            "amount_sign": "negative",
            "category_id": 2,
            "exclude_transaction": 0,
        }
    ]
    result = apply_rules(
        {
            "description": "Hofer Einkauf",
            "counterparty_name": "Hofer Filiale 1",
            "amount": -45.80,
        },
        rules,
    )
    assert result["matched_rule_id"] == 11
    assert result["category_id"] == 2

    no_match = apply_rules(
        {
            "description": "Hofer Einkauf",
            "counterparty_name": "Hofer Filiale 1",
            "amount": 45.80,
        },
        rules,
    )
    assert no_match["matched_rule_id"] is None
