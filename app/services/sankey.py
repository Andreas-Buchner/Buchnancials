from collections import defaultdict
from typing import Any, Iterator


def _iter_row_components(row: dict[str, Any]) -> Iterator[dict[str, Any]]:
    split_items = row.get("splits") or []
    if split_items:
        for split in split_items:
            yield {
                "amount": float(split.get("amount", 0.0)),
                "category_name": split.get("category_name") or "Uncategorized",
                "category_color": split.get("category_color"),
                "excluded": bool(split.get("excluded")),
            }
        return

    yield {
        "amount": float(row.get("amount", 0.0)),
        "category_name": row.get("category_name") or "Uncategorized",
        "category_color": row.get("category_color"),
        "excluded": False,
    }


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

        for component in _iter_row_components(row):
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

    collisions = income_links.keys() & expense_links.keys()

    def income_node_name(category: str) -> str:
        return f"{category} (Income)" if category in collisions else category

    def expense_node_name(category: str) -> str:
        return f"{category} (Expense)" if category in collisions else category

    nodes = {"Net"}
    links: list[dict[str, Any]] = []
    income_categories = tuple(sorted(income_links, key=lambda category: str(category).casefold()))
    expense_categories = tuple(sorted(expense_links, key=lambda category: str(category).casefold()))

    for category in income_categories:
        value = round(income_links[category], 2)
        if value <= 0:
            continue
        source = income_node_name(category)
        nodes.add(source)
        links.append({"source": source, "target": "Net", "value": value})

    for category in expense_categories:
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

    # Keep node order deterministic and let Plotly handle the visual alignment.
    income_nodes = [income_node_name(category) for category in income_categories]
    expense_nodes = [expense_node_name(category) for category in expense_categories]
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
    for category in income_categories:
        node_colors[income_node_name(category)] = income_colors.get(category, "#739c8f")
    for category in expense_categories:
        node_colors[expense_node_name(category)] = expense_colors.get(category, "#b98c87")
    if "Savings" in nodes:
        node_colors["Savings"] = "#5d7d68"
    if "Shortfall" in nodes:
        node_colors["Shortfall"] = "#9b6666"

    return {"nodes": ordered_nodes, "links": links, "node_colors": node_colors}
