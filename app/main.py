from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from plotly.offline import get_plotlyjs

from app.api.routes_categories import router as categories_router
from app.api.routes_import import router as import_router
from app.api.routes_reports import router as reports_router
from app.api.routes_rules import router as rules_router
from app.api.routes_snapshot import router as snapshot_router
from app.api.routes_transactions import router as transactions_router
from app.core.config import get_settings
from app.core.db import get_connection, init_db
from app.core.paths import STATIC_DIR, TEMPLATES_DIR, ensure_data_dirs
from app.services.reporting import build_grouped_transactions, list_all_transactions, list_categories, summarize
from app.services.sankey import build_sankey

app = FastAPI(title="Buchnancials")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def format_eur_compact(value: float | int | None) -> str:
    amount = int(round(float(value or 0)))
    formatted = f"{amount:,}".replace(",", " ")
    return f"{formatted} €"


templates.env.filters["eur"] = format_eur_compact

app.include_router(import_router)
app.include_router(transactions_router)
app.include_router(categories_router)
app.include_router(rules_router)
app.include_router(snapshot_router)
app.include_router(reports_router)


@app.on_event("startup")
def startup() -> None:
    ensure_data_dirs()
    with get_connection(get_settings().db_path) as conn:
        init_db(conn)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "img" / "logo.png", media_type="image/png")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    now = datetime.now()
    current_year = now.year
    current_quarter = ((now.month - 1) // 3) + 1
    current_month = now.month

    with get_connection() as conn:
        years = build_grouped_transactions(conn)
        categories = list_categories(conn)

    for year_bucket in years:
        year_rows: list[dict] = []
        year_bucket["is_current_year"] = year_bucket["year"] == current_year
        for quarter_bucket in year_bucket["quarters"]:
            quarter_rows: list[dict] = []
            quarter_bucket["is_current_quarter"] = (
                year_bucket["year"] == current_year and quarter_bucket["quarter"] == current_quarter
            )
            for month_bucket in quarter_bucket["months"]:
                month_rows = month_bucket["transactions"]
                month_bucket["is_current_month"] = (
                    year_bucket["year"] == current_year
                    and quarter_bucket["quarter"] == current_quarter
                    and month_bucket["month"] == current_month
                )
                month_bucket["summary"] = summarize(month_rows)
                month_bucket["sankey"] = build_sankey(month_rows)
                quarter_rows.extend(month_rows)
            quarter_bucket["summary"] = summarize(quarter_rows)
            quarter_bucket["sankey"] = build_sankey(quarter_rows)
            year_rows.extend(quarter_rows)
        year_bucket["summary"] = summarize(year_rows)
        year_bucket["sankey"] = build_sankey(year_rows)

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "years": years,
            "has_transactions": bool(years),
            "categories": categories,
            "current_year": current_year,
            "plotly_js": get_plotlyjs(),
        },
    )


@app.get("/import", response_class=HTMLResponse)
def import_page(request: Request):
    return templates.TemplateResponse("import.html", {"request": request})


@app.get("/categories/manage", response_class=HTMLResponse)
def categories_page(request: Request):
    return templates.TemplateResponse("categories.html", {"request": request})


@app.get("/rules/manage", response_class=HTMLResponse)
def rules_page(request: Request):
    return templates.TemplateResponse("rules.html", {"request": request})


@app.get("/planning", response_class=HTMLResponse)
def planning_page(request: Request):
    return templates.TemplateResponse("planning.html", {"request": request, "plotly_js": get_plotlyjs()})


@app.get("/transactions/raw", response_class=HTMLResponse)
def transactions_raw_page(request: Request):
    with get_connection() as conn:
        categories = list_categories(conn)
        transactions = list_all_transactions(conn)
    return templates.TemplateResponse(
        "transactions_raw.html",
        {
            "request": request,
            "transactions": transactions,
            "categories": categories,
        },
    )
