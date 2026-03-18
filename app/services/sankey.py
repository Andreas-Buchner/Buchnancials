from collections import defaultdict
from typing import Any


def build_sankey(rows: list[dict[str, Any]]) -> dict[str, Any]:
    income_links: dict[str, float] = defaultdict(float)
    expense_links: dict[str, float] = defaultdict(float)
    total_income = 0.0
    total_expenses = 0.0

    for row in rows:
        if row.get("excluded"):
            continue

        split_items = row.get("splits") or []
        if split_items:
            components = [
                {
                    "amount": float(split.get("amount", 0.0)),
                    "category_name": split.get("category_name") or "Uncategorized",
                }
                for split in split_items
            ]
        else:
            components = [
                {
                    "amount": float(row.get("amount", 0.0)),
                    "category_name": row.get("category_name") or "Uncategorized",
                }
            ]

        for component in components:
            amount = float(component["amount"])
            category = component["category_name"] or "Uncategorized"
            if amount >= 0:
                income_links[category] += amount
                total_income += amount
            else:
                expense_links[category] += abs(amount)
                total_expenses += abs(amount)

    collisions = set(income_links.keys()) & set(expense_links.keys())

    def income_node_name(category: str) -> str:
        return f"{category} (Income)" if category in collisions else category

    def expense_node_name(category: str) -> str:
        return f"{category} (Expense)" if category in collisions else category

    nodes = {"Net"}
    links: list[dict[str, Any]] = []

    for category in sorted(income_links.keys()):
        value = round(income_links[category], 2)
        if value <= 0:
            continue
        source = income_node_name(category)
        nodes.add(source)
        links.append({"source": source, "target": "Net", "value": value})

    for category in sorted(expense_links.keys()):
        value = round(expense_links[category], 2)
        if value <= 0:
            continue
        target = expense_node_name(category)
        nodes.add(target)
        links.append({"source": "Net", "target": target, "value": value})

    net = round(total_income - total_expenses, 2)
    if net > 0:
        nodes.add("Savings")
        links.append({"source": "Net", "target": "Savings", "value": net, "color": "#2e7d32"})
    elif net < 0:
        nodes.add("Shortfall")
        links.append({"source": "Shortfall", "target": "Net", "value": abs(net), "color": "#b71c1c"})

    # Keep node order stable and human-friendly.
    income_nodes = sorted([income_node_name(category) for category in income_links.keys()])
    expense_nodes = sorted([expense_node_name(category) for category in expense_links.keys()])
    ordered_nodes = income_nodes + ["Net"] + expense_nodes
    if "Savings" in nodes:
        ordered_nodes.append("Savings")
    if "Shortfall" in nodes:
        ordered_nodes = ["Shortfall"] + ordered_nodes

    return {"nodes": ordered_nodes, "links": links}
