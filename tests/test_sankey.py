from app.services.sankey import build_sankey


def test_sankey_adds_savings_when_income_exceeds_expenses():
    rows = [
        {"amount": 3000, "excluded": 0, "category_name": "Salary"},
        {"amount": -500, "excluded": 0, "category_name": "Food"},
        {"amount": -1000, "excluded": 0, "category_name": "Rent"},
        {"amount": -100, "excluded": 1, "category_name": "Ignored"},
    ]
    sankey = build_sankey(rows)
    assert "Net" in sankey["nodes"]
    assert "Savings" in sankey["nodes"]
    savings_link = next(link for link in sankey["links"] if link["target"] == "Savings")
    assert savings_link["value"] == 1500


def test_sankey_adds_shortfall_when_expenses_exceed_income():
    rows = [
        {"amount": 800, "excluded": 0, "category_name": "Salary"},
        {"amount": -1200, "excluded": 0, "category_name": "Rent"},
    ]
    sankey = build_sankey(rows)
    shortfall_link = next(link for link in sankey["links"] if link["source"] == "Shortfall")
    assert shortfall_link["target"] == "Net"
    assert shortfall_link["value"] == 400


def test_sankey_disambiguates_same_category_on_both_sides():
    rows = [
        {"amount": 1000, "excluded": 0, "category_name": "Uncategorized"},
        {"amount": -300, "excluded": 0, "category_name": "Uncategorized"},
    ]
    sankey = build_sankey(rows)
    assert "Uncategorized (Income)" in sankey["nodes"]
    assert "Uncategorized (Expense)" in sankey["nodes"]
    assert {"source": "Uncategorized (Income)", "target": "Net", "value": 1000} in sankey["links"]
    assert {"source": "Net", "target": "Uncategorized (Expense)", "value": 300} in sankey["links"]
