# Buchnancials

Buchnancials is my local-first cash flow tracker.

I built it for myself because I wanted a simple way to import bank CSVs, clean up transactions, apply categorization rules, and get useful monthly, quarterly, and yearly views without putting financial data into a cloud service.

The UI is mostly in German because this is a personal project first.

## What It Does

- imports CSV exports from my bank
- lets me map columns before import
- detects duplicates during import
- stores transactions locally in SQLite
- supports manual categorization, notes, and split transactions
- supports ignore flags for full transactions or individual split lines
- applies rule-based categorization
- shows rollups on year / quarter / month level
- includes dashboard views and Sankey diagrams for cash flow analysis
- supports local snapshot export/import

## Screenshots

These screenshots are from my local setup and are mainly here to show the UI and general workflow.

### Overview

![Overview screenshot](docs/screenshots/overview-ui.png)

### 2025 Average Month Sankey

![2025 average month Sankey](docs/screenshots/sankey-2025-average.png)

## Quick Start

1. Install dependencies:

```bash
uv sync
```

2. Start the app:

```bash
uv run buchnancials
```

3. Open it in the browser:

```text
It opens automatically in your browser.
```

For development with auto-reload you can still use:

```bash
uv run uvicorn app.main:app --reload
```

## How I Use It

1. Go to **Import** and upload a CSV export.
2. Check the suggested column mapping.
3. Import the transactions.
4. Review duplicates and imported rows.
5. Categorize transactions manually where needed.
6. Create or adjust rules in **Regeln** so the next import needs less manual work.
7. Use **Übersicht** and **Dashboards** for rollups and trends.
8. Use snapshot export/import for local backups or moving the data to another machine.

## Data And Privacy

Everything is stored locally.

- In a source checkout, `data/app.db` contains the main SQLite database
- In a source checkout, `data/imports/` stores imported CSV copies
- In a source checkout, `data/backups/` stores automatic backups, for example before snapshot import
- In a packaged Windows build, the data lives under `%LOCALAPPDATA%\Buchnancials`

There is no cloud sync in this project.

## Stack

- FastAPI
- Jinja2 templates
- Vanilla JavaScript
- Plotly
- SQLite

## Development

Run the test suite:

```bash
uv run pytest
```

Run a quick compile sanity check:

```bash
uv run python -m compileall app tests
```

## Portable Windows Build

The easiest way to share the app with another Windows machine is to build a self-contained portable bundle.

What this gives you:

- no Python installation needed on the target machine
- no manual dependency installation
- a normal `Buchnancials.exe` that starts the local web app and opens the browser automatically
- persistent app data stored outside the bundle in `%LOCALAPPDATA%\Buchnancials`

Important: PyInstaller does not cross-build a Windows `.exe` from WSL's Linux Python environment. The actual build has to run on the Windows side.

If you are in Windows PowerShell, run:

```powershell
./scripts/build_windows.ps1
```

If you are in WSL and the repo lives under `/mnt/c/...`, run:

```bash
./scripts/build_windows.sh
```

The WSL wrapper forwards the build to `powershell.exe`, so `uv` also needs to be installed on the Windows side.

The Windows build uses its own virtual environment in `.venv-build-windows` on purpose, so it does not collide with a WSL-created `.venv`.

That produces:

- `dist/Buchnancials-windows-portable.zip` as the file you can send to someone else
- usually also `dist/Buchnancials/` as a local portable app folder

The build is staged under `.build/windows-pyinstaller/`, so rebuilding still works even if an older `dist/Buchnancials/Buchnancials.exe` is currently running. In that case the zip is still refreshed, and only the local `dist/Buchnancials/` mirror may be skipped.

On the other machine:

1. unzip `Buchnancials-windows-portable.zip`
2. open the `Buchnancials` folder
3. double-click `Buchnancials.exe`
4. the app opens in the default browser

If you want a more polished installer later, the next step would be wrapping the portable bundle with Inno Setup or NSIS. The app-side packaging work in this repo is already compatible with that.

## License

GPL-3.0. See [LICENSE](LICENSE).
