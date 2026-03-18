from fastapi import APIRouter, Query

from app.core.db import get_connection
from app.services.reporting import (
    list_transactions_for_period,
    month_bounds,
    quarter_bounds,
    summarize,
    year_bounds,
)
from app.services.sankey import build_sankey

router = APIRouter(tags=["reports"])


@router.get("/reports/monthly")
def reports_monthly(year: int = Query(...), month: int = Query(..., ge=1, le=12)) -> dict:
    start, end = month_bounds(year, month)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year, "month": month}, "summary": summarize(rows)}


@router.get("/reports/quarterly")
def reports_quarterly(year: int = Query(...), quarter: int = Query(..., ge=1, le=4)) -> dict:
    start, end = quarter_bounds(year, quarter)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year, "quarter": quarter}, "summary": summarize(rows)}


@router.get("/reports/yearly")
def reports_yearly(year: int = Query(...)) -> dict:
    start, end = year_bounds(year)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year}, "summary": summarize(rows)}


@router.get("/reports/sankey")
def reports_sankey_monthly(year: int = Query(...), month: int = Query(..., ge=1, le=12)) -> dict:
    start, end = month_bounds(year, month)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year, "month": month}, "sankey": build_sankey(rows)}


@router.get("/reports/sankey/quarterly")
def reports_sankey_quarterly(year: int = Query(...), quarter: int = Query(..., ge=1, le=4)) -> dict:
    start, end = quarter_bounds(year, quarter)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year, "quarter": quarter}, "sankey": build_sankey(rows)}


@router.get("/reports/sankey/yearly")
def reports_sankey_yearly(year: int = Query(...)) -> dict:
    start, end = year_bounds(year)
    with get_connection() as conn:
        rows = list_transactions_for_period(conn, start, end)
    return {"period": {"year": year}, "sankey": build_sankey(rows)}

