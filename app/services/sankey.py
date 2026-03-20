from collections import defaultdict
from typing import Any


def build_sankey(rows: list[dict[str, Any]]) -> dict[str, Any]:
    income_links: dict[str, float] = defaultdict(float)
    expense_links: dict[str, float] = defaultdict(float)
    income_colors: dict[str, str] = {}
    expense_colors: dict[str, str] = {}
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
                    "category_color": split.get("category_color"),
                    "excluded": bool(split.get("excluded")),
                }
                for split in split_items
            ]
        else:
            components = [
                {
                    "amount": float(row.get("amount", 0.0)),
                    "category_name": row.get("category_name") or "Uncategorized",
                    "category_color": row.get("category_color"),
                    "excluded": False,
                }
            ]

        for component in components:
            if component["excluded"]:
                continue
            amount = float(component["amount"])
            category = component["category_name"] or "Uncategorized"
            category_color = component.get("category_color")
            if amount >= 0:
                income_links[category] += amount
                if category not in income_colors and category_color:
                    income_colors[category] = str(category_color)
                total_income += amount
            else:
                expense_links[category] += abs(amount)
                if category not in expense_colors and category_color:
                    expense_colors[category] = str(category_color)
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
        links.append({"source": "Net", "target": "Savings", "value": net, "color": "rgba(64, 90, 102, 0.58)"})
    elif net < 0:
        nodes.add("Shortfall")
        links.append({"source": "Shortfall", "target": "Net", "value": abs(net), "color": "rgba(123, 80, 80, 0.58)"})

    # Keep node order stable and human-friendly.
    income_nodes = sorted((income_node_name(category) for category in income_links.keys()), key=str.casefold)
    expense_nodes = sorted((expense_node_name(category) for category in expense_links.keys()), key=str.casefold)
    ordered_nodes = income_nodes + ["Net"] + expense_nodes
    if "Savings" in nodes:
        ordered_nodes.append("Savings")
    if "Shortfall" in nodes:
        ordered_nodes.append("Shortfall")

    node_index = {label: idx for idx, label in enumerate(ordered_nodes)}

    # Emit links in node-order direction to make client-side rendering deterministic.
    def link_sort_key(link: dict[str, Any]) -> tuple[int, int, int]:
        source = str(link.get("source", ""))
        target = str(link.get("target", ""))
        if target == "Net":
            group = 0
        elif source == "Net":
            group = 1
        else:
            group = 2
        return (group, node_index.get(source, 10_000), node_index.get(target, 10_000))

    links.sort(key=link_sort_key)

    node_colors: dict[str, str] = {"Saldo": "#121212", "Net": "#121212"}
    for category in income_links.keys():
        node_colors[income_node_name(category)] = income_colors.get(category, "#739c8f")
    for category in expense_links.keys():
        node_colors[expense_node_name(category)] = expense_colors.get(category, "#b98c87")
    if "Savings" in nodes:
        node_colors["Savings"] = "#5d7d68"
    if "Shortfall" in nodes:
        node_colors["Shortfall"] = "#9b6666"

    return {"nodes": ordered_nodes, "links": links, "node_colors": node_colors}
