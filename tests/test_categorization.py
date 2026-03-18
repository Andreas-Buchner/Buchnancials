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


def test_apply_rules_supports_secondary_condition_with_or():
    rules = [
        {
            "id": 21,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "salary",
            "second_match_field": "raw_text",
            "second_match_type": "contains",
            "second_match_value": "bonus",
            "condition_operator": "or",
            "category_id": 7,
            "exclude_transaction": 0,
        }
    ]

    result = apply_rules({"description": "Monthly payment", "raw_text": "Annual bonus transfer"}, rules)
    assert result["matched_rule_id"] == 21
    assert result["category_id"] == 7


def test_apply_rules_respects_positive_amount_sign():
    rules = [
        {
            "id": 31,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "bonus",
            "amount_sign": "positive",
            "category_id": 1,
            "exclude_transaction": 0,
        }
    ]
    positive_match = apply_rules({"description": "Annual Bonus", "amount": 500.0}, rules)
    negative_no_match = apply_rules({"description": "Annual Bonus", "amount": -500.0}, rules)
    assert positive_match["matched_rule_id"] == 31
    assert negative_no_match["matched_rule_id"] is None


def test_apply_rules_supports_secondary_condition_with_and():
    rules = [
        {
            "id": 41,
            "match_field": "description",
            "match_type": "contains",
            "match_value": "miete",
            "second_match_field": "counterparty_name",
            "second_match_type": "contains",
            "second_match_value": "hausverwaltung",
            "condition_operator": "and",
            "category_id": 3,
            "exclude_transaction": 0,
        }
    ]

    both_match = apply_rules({"description": "Miete April", "counterparty_name": "Hausverwaltung GmbH"}, rules)
    only_primary_match = apply_rules({"description": "Miete April", "counterparty_name": "Privat"}, rules)
    assert both_match["matched_rule_id"] == 41
    assert only_primary_match["matched_rule_id"] is None
