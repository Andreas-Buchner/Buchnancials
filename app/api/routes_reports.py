from typing import Any, Callable

from fastapi import APIRouter, Query

from app.core.db import get_connection
from app.services.reporting import (
    build_planning_dataset,
    list_transactions_for_period,
    month_bounds,
    quarter_bounds,
    summarize,
    year_bounds,
)
from app.services.sankey import build_sankey

router = APIRouter(tags=["reports"])


def _build_period_response(
    period: dict[str, int],
    start: str,
    end: str,
    payload_key: str,
    payload_builder: Callable[[list[dict[str, Any]]], dict],
) -> dict:
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": period, payload_key: payload_builder(rows)}


@router.get("/reports/monthly")
def reports_monthly(year: int = Query(...), month: int = Query(..., ge=1, le=12)) -> dict:
    start, end = month_bounds(year, month)
    return _build_period_response({"year": year, "month": month}, start, end, "summary", summarize)


@router.get("/reports/quarterly")
def reports_quarterly(year: int = Query(...), quarter: int = Query(..., ge=1, le=4)) -> dict:
    start, end = quarter_bounds(year, quarter)
    return _build_period_response({"year": year, "quarter": quarter}, start, end, "summary", summarize)


@router.get("/reports/yearly")
def reports_yearly(year: int = Query(...)) -> dict:
    start, end = year_bounds(year)
    return _build_period_response({"year": year}, start, end, "summary", summarize)


@router.get("/reports/sankey")
def reports_sankey_monthly(year: int = Query(...), month: int = Query(..., ge=1, le=12)) -> dict:
    start, end = month_bounds(year, month)
    return _build_period_response({"year": year, "month": month}, start, end, "sankey", build_sankey)


@router.get("/reports/sankey/quarterly")
def reports_sankey_quarterly(year: int = Query(...), quarter: int = Query(..., ge=1, le=4)) -> dict:
    start, end = quarter_bounds(year, quarter)
    return _build_period_response({"year": year, "quarter": quarter}, start, end, "sankey", build_sankey)


@router.get("/reports/sankey/yearly")
def reports_sankey_yearly(year: int = Query(...)) -> dict:
    start, end = year_bounds(year)
    return _build_period_response({"year": year}, start, end, "sankey", build_sankey)


@router.get("/reports/planning")
def reports_planning(top_n_categories: int = Query(8, ge=3, le=20)) -> dict:
    with get_connection() as conn:
        payload = build_planning_dataset(conn, top_n_categories=top_n_categories)
    return payload
