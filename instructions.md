# Buchnancials – Build Instructions

## Purpose

Build a local-first, privacy-first personal cash flow tracking application named **Buchnancials**.

The application imports bank account transactions from CSV files, stores them locally in SQLite, allows manual and rule-based categorization, supports excluding selected transactions from cash flow calculations, and provides monthly, quarterly, and yearly visualizations in form of Sankey diagrams.

This document describes what should be built. Keep the implementation practical, simple, and maintainable. Avoid unnecessary complexity.

---

## Product Scope

The application must:

- run fully locally on the user's machine
- not require any cloud services or external APIs
- use **Python** for the backend
- use **SQLite** for persistent local storage
- provide a **minimal web frontend**
- keep frontend and backend in the **same repository**
- support importing one or more CSV transaction exports over time
- ignore already imported transactions
- allow the user to review and edit transactions month by month
- generate Sankey-based and summary-style cash flow views

---

## V1 Product Decisions

To reduce ambiguity for AI coding tools, the first version must follow these explicit decisions.

### Frontend Architecture

Use **server-rendered Jinja2 templates** with **minimal vanilla JavaScript** and locally served static CSS/JS.

Do not use React, Vue, Svelte, or any separate frontend build pipeline in v1.

### Database Access

Use Python's built-in **sqlite3** module with SQLite.

Implementation guidance:

- keep SQL explicit and easy to inspect
- use a small `db.py` helper plus thin repository/data-access functions where useful
- avoid introducing an ORM in v1
- keep the schema simple and migrations lightweight and manual if needed

### Chart Library

Use **Plotly.js** for Sankey rendering in the frontend.

Reason:

- Sankey support is built-in
- works well in a locally served web UI
- avoids custom chart rendering complexity

### Packaging and Runtime

The application is a **locally hosted web app**, not a packaged desktop app, in v1.

Run it with a simple local startup command such as:

```bash
uvicorn app.main:app --reload
```

Also provide a small convenience script such as `scripts/run_dev.sh` or an equivalent cross-platform helper.

Desktop packaging with PyInstaller, Tauri, Electron, or similar is explicitly out of scope for v1.

### Canonical Transaction Model

After import and normalization, each transaction must use this canonical set of fields:

- `booking_date`
- `value_date` nullable
- `amount`
- `currency` nullable
- `counterparty_name` nullable
- `description`
- `raw_text` nullable
- `memo` nullable
- `category_id` nullable
- `excluded`
- `dedupe_key`
- `import_job_id`
- `raw_data_json`
- `created_at`
- `updated_at`

Description selection for v1:

- use the CSV field equivalent to `Verwendungszweck` if present
- otherwise fall back to the CSV field equivalent to `Text` or booking text

`counterparty_name` should be derived from the most relevant sender or recipient name field available in the source CSV.

`raw_text` should preserve the original booking text field for debugging and rule matching.

### Unsaved Changes Behavior

Transaction edits in the UI must be staged locally first.

Behavior requirements:

- staged edits are not persisted until the user clicks **Save**
- if the user attempts to navigate away, reload the page, switch year/quarter/month section, or otherwise leave the current edited view while staged changes exist, show a warning
- the user must explicitly choose whether to save or discard changes
- expand/collapse actions must not silently discard staged changes

### Grouped UI Defaults

The grouped year/quarter/month UI must behave as follows in v1:

- the **current year** is expanded by default
- older years are collapsed by default
- quarters are collapsed by default
- when a quarter is expanded, its three month sections become visible
- each month section shows its Sankey diagram above its transaction table
- quarter-level and year-level Sankey diagrams are shown in their respective container headers or directly under them

### Sankey Definition for V1

Use exactly one Sankey layout in v1.

The layout is:

- `Income Sources -> Net -> Expense Categories`

Interpretation:

- each positive categorized transaction contributes from its income category into `Net`
- each negative categorized transaction contributes from `Net` into its expense category
- excluded transactions are ignored
- uncategorized transactions may be grouped under a fallback category named `Uncategorized`
- if total income exceeds total expenses for the selected period, add a green balancing flow from `Net` to `Savings`
- if total expenses exceed total income for the selected period, add a red balancing flow from `Shortfall` to `Net`
- `Savings` is the arithmetic remainder for the period and is not an expense category
- `Shortfall` is a balancing node representing overspending for the period and is not an income category

Do not implement multiple Sankey modes in v1.

### Duplicate Detection Tradeoff

Use a simple deterministic deduplication strategy in v1 based on:

- normalized `booking_date`
- normalized `amount`
- normalized `description`

This is an intentional MVP tradeoff.

The implementation must prioritize avoiding accidental merging of distinct transactions. Do not introduce fuzzy matching in v1.

### Explicitly Out of Scope for V1

The following are out of scope and should not be implemented unless explicitly requested later:

- multi-user support
- authentication or accounts
- desktop packaging
- bank API integrations
- cloud sync
- OCR or PDF import
- automatic category learning beyond simple user-defined rules
- advanced forecasting or budgeting features
- mobile-first UI optimization

---

## High-Level Architecture

Build a single-repository application with:

- a Python backend
- a local SQLite database
- a minimal web UI served locally by the backend

### Framework Choice

Use **FastAPI** for the backend.

Reason:

- simple and lightweight
- well-suited for JSON APIs
- easy to structure cleanly
- automatic API documentation is useful during development

The backend should:

- parse CSV files
- provide preview and column-mapping support
- normalize transaction data
- store and retrieve data from SQLite
- apply duplicate detection
- apply heuristic categorization rules
- compute monthly, quarterly, and yearly summaries
- prepare Sankey diagram data for the frontend
- render Jinja2 templates for the frontend views

The frontend should:

- allow CSV upload
- show CSV preview and column mapping UI
- show imported transactions grouped by year, quarter, and month
- allow inline editing of categories, memos, and exclusion status
- allow category management
- allow rule management
- show monthly Sankey visualizations
- show quarterly and yearly summary views

Keep the frontend minimal and functional. Do not overengineer the UI.

---

## Suggested Repository Structure

Use a structure close to the following:

```text
buchnancials/
├─ app/
│  ├─ api/
│  │  ├─ routes_import.py
│  │  ├─ routes_transactions.py
│  │  ├─ routes_categories.py
│  │  ├─ routes_rules.py
│  │  └─ routes_reports.py
│  ├─ core/
│  │  ├─ config.py
│  │  ├─ paths.py
│  │  └─ db.py
│  ├─ models/
│  │  ├─ transaction.py
│  │  ├─ category.py
│  │  ├─ rule.py
│  │  └─ import_job.py
│  ├─ services/
│  │  ├─ csv_preview.py
│  │  ├─ csv_import.py
│  │  ├─ deduplication.py
│  │  ├─ categorization.py
│  │  ├─ reporting.py
│  │  └─ sankey.py
│  ├─ frontend/
│  │  ├─ templates/
│  │  └─ static/
│  │     ├─ css/
│  │     └─ js/
│  └─ main.py
├─ data/
│  ├─ app.db
│  ├─ imports/
│  └─ backups/
├─ tests/
├─ scripts/
├─ README.md
├─ instructions.md
└─ pyproject.toml
```

This structure does not need to be followed exactly, but the same separation of concerns should be preserved.

---

## Core Functional Requirements

### 1. CSV Import

The app must support importing transaction CSV files exported from a bank account.

Requirements:

- user can upload or select a CSV file
- before import, the app shows a preview of the CSV contents
- the app detects available columns from the CSV
- the user can map CSV columns to internal fields
- the app then imports the transactions into SQLite

The system must support at least these canonical internal fields during import mapping:

- booking date
- amount
- description / booking text
- counterparty name (optional)
- raw text (optional)
- value date (optional)
- currency (optional)

The importer must be tolerant of:

- varying column names
- different date formats
- different decimal separators
- different encodings where reasonably possible

The CSV parser must:

- support delimiter detection, including comma and semicolon
- handle quoted fields correctly
- ignore empty lines

If the CSV cannot be parsed cleanly, the UI should show a clear error.

---

### 2. CSV Preview and Column Mapping

Before importing a file, the user must be able to preview the data and map columns.

Requirements:

- display a sample of rows from the CSV
- display the detected CSV column names
- allow the user to assign CSV columns to internal fields
- validate that required fields are mapped before import
- store the mapping used for each import job for traceability

Required minimum mappings for import:

- booking date
- amount
- description or equivalent transaction text field

Optional mappings:

- counterparty_name
- description
- raw_text

---

### 3. Transaction Storage

Each imported transaction must be persisted in SQLite.

Requirements:

- every transaction is stored as a row in the database
- raw imported source data should also be preserved as JSON in `raw_data_json`
- each transaction should retain a link to the import job it came from
- timestamps for creation and update should be stored

The user must be able to re-open the app and continue working with existing data.

---

### 4. Duplicate Detection

Already imported transactions must be ignored.

Requirements:

- generate a deterministic deduplication key for each normalized transaction
- before inserting a transaction, check whether the dedupe key already exists
- skip transactions that are already present
- show an import summary with counts for:
  - imported new transactions
  - ignored duplicates
  - failed rows if any

The dedupe key must be:

- deterministic
- stable across imports

Suggested implementation:

- concatenate normalized:
  - booking_date
  - amount
  - description
- apply lowercase and trim
- generate a hash, for example SHA256
- store the resulting value as `dedupe_key`

Add a UNIQUE constraint on `dedupe_key`.

This simple rule is intentional for v1. Do not add fuzzy duplicate matching.

### 5. Monthly Transaction Review

Transactions must be displayed month by month inside the grouped year/quarter/month layout.

Requirements:

- show transactions grouped by year and month
- for each month, show a transaction list or table
- allow sorting and basic filtering if practical
- allow editing of each transaction's category
- allow toggling whether a transaction is excluded from cash flow calculations
- allow adding of memo for the transaction
- changes should be visible in the frontend and can be persisted by clicking an explicit button, then the changes are committed to the database

Edits to category, excluded flag, and memo must:

- be staged in the UI
- only be persisted when the user clicks a Save button
- support batch update of multiple transactions in one action
- survive expand/collapse interactions within the current page state
- trigger a warning before navigation or reload if unsaved changes exist

A transaction list row should ideally show:

- date
- amount
- description
- counterparty name if available
- memo
- category
- excluded status

---

### 6. Categories

The app must support user-defined categories for income and expenses.

Requirements:

- categories can be created, edited, and deactivated
- categories have a name
- categories have a type:
  - income
  - expense
- transactions can be assigned to categories manually
- categories are used in reporting and Sankey views

Keep category handling simple.

---

### 7. Excluded Transactions

Certain transactions must be excludable from cash flow calculations.

Examples:

- transfers between own accounts
- investments
- technical corrections
- anything the user does not want included in cash flow reporting

Requirements:

- each transaction has an `excluded` flag
- excluded transactions remain stored and visible
- excluded transactions are ignored in summary statistics and Sankey calculations
- the user can toggle exclusion at any time

---

### 8. Rule-Based Auto-Categorization

Newly imported transactions should be categorized automatically when possible.

Requirements:

- support a small rule engine based on simple heuristics
- rules are user-configurable
- rules are applied during import of new transactions
- rules should be editable in the UI

A rule must support at least:

- target field to inspect
  - description
  - counterparty_name
  - raw_text
- match type
  - contains
  - equals
  - starts with
  - regex (optional but useful)
- match value
- resulting category
- optional action to mark as excluded
- priority / order
- active or inactive status

Rules should be evaluated in a deterministic order.

Keep the rule engine simple and transparent.

---

### 9. Reporting and Summaries

The app must provide aggregated views over the stored transactions.

Requirements:

- monthly summaries
- quarterly summaries
- yearly summaries

Each summary should at least show:

- total income
- total expenses
- net cash flow
- totals by category

All summaries must ignore excluded transactions.

---

### 10. Sankey Diagram

The app must provide Sankey diagram visualizations.

Requirements:

- a Sankey view is generated for a selected month
- quarterly and yearly Sankey summaries are also supported
- visualizations are based on non-excluded transactions
- the backend prepares the Sankey data structure
- the frontend renders the chart using Plotly.js

The Sankey layout for v1 is fixed and must be:

- income sources -> net -> expense categories

Additional requirements:

- positive categorized transactions contribute into `Net`
- negative categorized transactions flow out of `Net`
- if income exceeds expenses, add `Net -> Savings`
- if expenses exceed income, add `Shortfall -> Net`
- uncategorized transactions should be assigned to a fallback category named `Uncategorized`
- excluded transactions are ignored
- the chart should prioritize correctness, readability, and stable category totals

The chart does not need to be visually fancy, but it should be useful.

### Sankey Data Format

The backend should return Sankey data in a simple JSON format such as:

```json
{
  "nodes": ["Salary", "Net", "Food", "Rent", "Savings"],
  "links": [
    {"source": "Salary", "target": "Net", "value": 3000},
    {"source": "Net", "target": "Food", "value": 500},
    {"source": "Net", "target": "Rent", "value": 1200},
    {"source": "Net", "target": "Savings", "value": 1300}
  ]
}
```

The frontend and backend should use one consistent Sankey data contract.

---

## Non-Functional Requirements

### Local-Only

The application must run entirely locally.

Requirements:

- no cloud backend
- no external API dependency
- no remote database
- no user account system
- no login flow

### Privacy-First

Requirements:

- all user data is stored locally
- imported CSV data is handled only on the local machine
- no analytics or telemetry

### Simple Maintainability

Requirements:

- code should be easy to understand
- keep business logic separated from route handlers
- avoid unnecessary abstraction layers
- prefer explicit, readable code over cleverness

### Minimal UI

Requirements:

- clean, minimal interface
- focus on usability over design complexity
- desktop browser usage is the main target

### UI Layout and Grouping

The main reporting and transaction review UI should use a grouped tabular layout.

Requirements:

- transactions are grouped by year and month
- each month is rendered as its own table
- each month table has a Sankey diagram shown above it
- after every quarter, show an additional quarter-level Sankey diagram
- quarter sections should support expand and collapse of the three underlying months
- after every year, show a year-level Sankey diagram
- year sections should support expand and collapse of the underlying quarters and months
- the current year is expanded by default
- older years are collapsed by default
- the current quarter is expanded by default
- older quarters are collapsed by default
- expand/collapse must not silently discard staged edits

The intended hierarchy is:

- year
  - year sankey diagram
  - quarter
    - quarter sankey diagram
    - month
      - sankey diagram
      - transaction table

Quarter and year views act as aggregated containers over the lower-level sections.

The UI should remain simple, readable, and optimized for desktop use, even with this grouping behavior.

---

## Database Design

Keep the schema simple.

### `transactions`

Store imported and user-edited transactions.

Suggested fields:

- `id`
- `booking_date`
- `value_date` nullable
- `amount`
- `currency` nullable
- `counterparty_name` nullable
- `description`
- `raw_text` nullable
- `memo` nullable
- `category_id` nullable
- `excluded` boolean
- `dedupe_key`
- `import_job_id`
- `raw_data_json`
- `created_at`
- `updated_at`

### `categories`

Store user-defined categories.

Suggested fields:

- `id`
- `name`
- `type` (`income` or `expense`)
- `active`
- `created_at`
- `updated_at`

### `rules`

Store categorization and exclusion rules.

Suggested fields:

- `id`
- `name`
- `match_field`
- `match_type`
- `match_value`
- `category_id` nullable
- `exclude_transaction` boolean
- `priority`
- `active`
- `created_at`
- `updated_at`

### `import_jobs`

Track imports.

Suggested fields:

- `id`
- `filename`
- `column_mapping_json`
- `row_count`
- `new_row_count`
- `duplicate_row_count`
- `failed_row_count`
- `imported_at`

### Database Constraints

- `transactions.id`, `categories.id`, `rules.id`, and `import_jobs.id` should use `INTEGER PRIMARY KEY AUTOINCREMENT`
- `transactions.dedupe_key` must be UNIQUE
- `transactions.category_id` references `categories.id`
- `rules.category_id` references `categories.id`
- `transactions.import_job_id` references `import_jobs.id`

This schema can evolve later, but should remain simple in the first version.

---

## Storage and Paths

For now, keep local storage simple.

Requirements:

- store the SQLite database in a local `data/` directory during development
- create the database automatically if it does not exist
- create tables automatically if they do not exist
- optionally store imported CSV files in `data/imports/`
- optionally store database backups in `data/backups/`

### Initial Setup

On first startup:

- create the database if it does not exist
- create all required tables
- optionally create a few default categories for easier first use, for example:
  - Salary
  - Food
  - Rent

This can be refined later for packaging and OS-specific paths.

---

## API Design (Minimal)

The backend should expose a simple REST API.

Suggested endpoints:

- `GET /`
- `GET /import`
- `POST /import/preview`
- `POST /import/execute`
- `GET /transactions?year=YYYY&month=MM`
- `PATCH /transactions/{id}`
- `PATCH /transactions/batch`
- `GET /categories`
- `POST /categories`
- `PATCH /categories/{id}`
- `GET /rules`
- `POST /rules`
- `PATCH /rules/{id}`
- `GET /reports/monthly?year=YYYY&month=MM`
- `GET /reports/quarterly?year=YYYY&quarter=Q`
- `GET /reports/yearly?year=YYYY`
- `GET /reports/sankey?year=YYYY&month=MM`
- `GET /reports/sankey/quarterly?year=YYYY&quarter=Q`
- `GET /reports/sankey/yearly?year=YYYY`

Responses should be JSON for API routes. Page routes may render Jinja2 templates.

## Backend Responsibilities

The backend should provide endpoints or handlers for:

- root page rendering
- CSV upload / selection
- CSV preview
- column mapping submission
- import execution
- transaction listing by month
- transaction editing
- batch transaction editing
- category CRUD
- rule CRUD
- monthly / quarterly / yearly summaries
- monthly / quarterly / yearly Sankey data generation

Keep validation and business logic out of route handlers where possible.

---

## Frontend Responsibilities

The frontend should provide at least these screens or views:

### Import View
- upload/select CSV
- preview rows
- map columns
- start import
- show import results

### Transactions View
- browse transactions by grouped year/quarter/month sections
- edit category
- toggle excluded state
- edit memo
- inspect transaction details
- save or discard staged changes explicitly

### Categories View
- create category
- edit category
- deactivate category

### Rules View
- create rule
- edit rule
- enable/disable rule
- delete rule

### Reports View
- monthly summary
- quarterly summary
- yearly summary
- monthly Sankey diagram
- quarterly Sankey diagram
- yearly Sankey diagram

The frontend should remain straightforward and optimized for local desktop use.

---

## Data Normalization Rules

During import, normalize input data before persistence.

At minimum:

- normalize dates into a consistent format
- normalize decimal numbers into consistent numeric values
- trim whitespace
- normalize empty strings to null where useful
- populate canonical fields consistently
- generate the dedupe key from normalized values

Store both normalized values and the raw imported representation.

---

## Error Handling

The app should provide clear, user-readable error handling.

Cases to handle:

- invalid CSV format
- missing required mappings
- date parsing failures
- amount parsing failures
- encoding problems
- import conflicts
- malformed rules
- invalid category references
- unsaved changes warnings on navigation or reload

Errors should be reported clearly in the UI instead of failing silently.

---

## Tests

Implement a small but useful automated test suite.

Prioritize tests for:

- CSV parsing
- column mapping validation
- normalization logic
- canonical field population
- dedupe key generation
- duplicate detection
- rule matching
- summary calculations
- exclusion handling
- Sankey data generation

Do not overbuild the test suite, but cover the core logic.

---

## Implementation Guidance

Preferred style:

- simple architecture
- explicit data flow
- small service modules for core logic
- SQLite access encapsulated cleanly
- avoid unnecessary framework complexity

Good priorities:

1. database setup
2. Jinja2 page scaffolding and base layout
3. CSV preview and mapping
4. import pipeline
5. duplicate detection
6. grouped monthly transaction view
7. category editing
8. exclusion toggling
9. rule engine
10. reporting
11. Sankey visualization
12. unsaved changes protection

---

## Acceptance Criteria

The implementation is successful when all of the following are true:

- a user can upload a bank CSV file
- the app shows a preview and allows column mapping
- the app imports new transactions into SQLite
- duplicate transactions are ignored
- imported transactions can be browsed month by month inside grouped year and quarter containers
- categories can be created and assigned
- transactions can be excluded from cash flow calculations
- categorization rules can be configured and applied on new imports
- the app shows monthly, quarterly, and yearly summaries
- the app renders monthly, quarterly, and yearly Sankey diagrams using one consistent layout
- staged transaction edits are only persisted on explicit save
- the app warns before navigation or reload when unsaved edits exist
- the app runs fully locally with no cloud dependencies

---

## Final Note

Build the smallest solid version first.

Favor correctness, clarity, and maintainability over advanced architecture. This is a local single-user application, so the implementation should stay pragmatic and easy to extend later.
