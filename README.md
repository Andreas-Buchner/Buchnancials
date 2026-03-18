# Buchnancials

Local-first personal cash-flow tracking with CSV import, rules, and Sankey-based reporting.

Buchnancials is built for people who want complete control over their financial data without cloud sync.

## Highlights

- CSV import with preview and flexible column mapping
- Duplicate detection during import
- Manual categorization and notes
- Split transactions into multiple categories
- Exclude full transactions or individual split lines from reporting
- Rules engine with:
  - primary + optional secondary condition
  - `UND` / `ODER` condition linking
  - income/expense scope filter (`Erträge` / `Aufwände`)
  - optional auto-ignore behavior
- Year / quarter / month rollups with interactive Sankey diagrams
- Category color support, reused in Sankey rendering
- Local snapshot export/import for moving data across machines

## Tech stack

- FastAPI
- Jinja2 templates
- Vanilla JS
- Plotly Sankey
- SQLite

## Quick start

1. Install dependencies:

```bash
uv sync
```

2. Run the app:

```bash
uv run uvicorn app.main:app --reload
```

3. Open:

```text
http://127.0.0.1:8000
```

## Typical workflow

1. Go to **Import** and upload a CSV.
2. Confirm/adjust the suggested column mapping.
3. Import transactions.
4. Review/categorize in **Transaktionen**.
5. Create or tune rules in **Regeln**.
6. Maintain categories and colors in **Kategorien**.
7. Use **Snapshot export/import** for local backups or machine migration.

## Data storage

All data is local and stored in `data/`:

- `data/app.db` - main SQLite database
- `data/imports/` - imported CSV copies
- `data/backups/` - automatic backups (e.g. before snapshot import)

## Development

Run tests:

```bash
uv run pytest
```

Type-check/compile sanity:

```bash
uv run python -m compileall app tests
```

## License

GPL-3.0. See [LICENSE](LICENSE).
