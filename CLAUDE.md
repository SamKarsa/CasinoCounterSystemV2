# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run tauri dev` — run the full desktop app (spawns Vite on port 1420 and the Rust backend). Use this, not `npm run dev` alone, when you need the Tauri bridge.
- `npm run dev` — frontend-only Vite dev server. `window.__TAURI__` will be undefined, so any `invoke()` calls will fail.
- `npm run build` — runs `tsc` (type-check, no emit) then `vite build` into `dist/`. Used by Tauri as `beforeBuildCommand`.
- `npm run tauri build` — production desktop bundle.
- `cargo check` / `cargo build` inside `src-tauri/` — compile the Rust side without launching the app.

No test runner, linter, or formatter is configured. Type errors surface only through `tsc` via `npm run build`.

## Business context

Desktop app for a slot-machine route business. ~6 routes, ~120 machines each. Every 15 days a technician reads each machine's IN/OUT counters on paper; a data-entry person then types all records into this app. Per machine, compared against the previous record: `IN-OUT = ((in_now - in_prev) - (out_now - out_prev)) * coinValue`, `saldo = totalDelivered / 2`, `faltaSobra = totalDelivered - IN-OUT`. The core UX priority is fast keyboard-driven batch data entry (~120 records per session) in the Counter Record screen.

The app is 100% local/offline, single PC, single user at a time. An older C# WinForms + SQLite version is in production; its schema matches this one, so migration will be a file copy plus a one-time plaintext→Argon2 password migration.

Business rule: machines whose type is named exactly 'Poker' compute
IN-OUT as (Δout) * coinValue (only the OUT counter). All other types
use ((Δin) - (Δout)) * coinValue. The comparison is by
nameTypeMachine = 'Poker' — do not rename that seed row.

## Architecture

Tauri 2 desktop app with a React 19 + TypeScript frontend and a Rust backend.

**Frontend entry:** `src/main.tsx` → `src/App.tsx`. Currently a static landing page — routing, queries, and forms libraries are installed (`react-router-dom` v7, `@tanstack/react-query` v5, `react-hook-form` + `zod`) but not yet wired up. **Next step:** a login screen that `invoke("authenticate_user", ...)` (the only command exposed so far); CRUD commands for `Machine`/`Route`/`CounterRecord` are not built yet, though their models exist in `database/models.rs`.

**Backend entry:** `src-tauri/src/main.rs` → `casino_counter_lib::run()` in `lib.rs`. The crate is named `casino_counter_lib` (the `_lib` suffix is a Windows/Cargo workaround — don't rename it). In `run()`, `setup()` resolves the DB path (cwd in debug, `app_data_dir` in release), calls `database::init_database(db_path)`, and registers the `Connection` as Tauri state via `app.manage(DbConnection(...))`. Tauri commands are registered via `tauri::generate_handler![...]`.

**Commands layer (`src-tauri/src/commands/`):** `mod.rs` defines `DbConnection(Mutex<Connection>)`, the shared DB state injected into commands via `State<DbConnection>`. `auth.rs` holds `authenticate_user` — verifies passwords with argon2 and returns a generic `"Invalid credentials"` string on any failure (never leaks whether the user or the hash was the problem). Add new command modules here and register them in `lib.rs`.

**Database layer (`src-tauri/src/database/`):** SQLite via `rusqlite` with the `bundled` feature (no system SQLite needed). Wired into `lib.rs` (see above). `init_database(db_path)` takes the resolved path, applies pragmas (WAL, foreign keys, cache/temp tuning), creates tables, and runs the seed.

- `mod.rs` — `init_database(db_path)`: opens the DB at the given path, sets pragmas, creates tables + indexes, runs seed. The dev/prod path split lives in `lib.rs`, not here.
- `models.rs` — Rust structs mirror DB rows. They use `#[serde(rename_all = "camelCase")]` so the JSON exposed to the frontend matches the camelCase SQL column names (e.g. `userId`, `numberMachine`).
- `seed.rs` — idempotent seed: inserts Roles, default Admin/Operator users, machine types, and coin denominations only if `Role` is empty.

**Schema shape** (see `create_tables` in `database/mod.rs` for the source of truth): `Role` → `Users`; `Route`, `TypeMachine`, `CoinType` → `Machine` → `CounterRecord` (meter readings: `counterIn`, `counterOut`, `totalDelivered`). All FKs are enforced at runtime via `PRAGMA foreign_keys = ON`.
`InfoMachine` was intentionally removed from this app; an orphan `InfoMachine` table may exist in migrated production DBs — ignore it, never recreate it.

**Styling:** Tailwind CSS v4 via `@tailwindcss/postcss` (v4, not v3 — config shape differs). The custom `navy` palette is defined in CSS via `@theme` in `src/App.css` (Tailwind v4 does not auto-read `tailwind.config.js`), so `navy-*` utility classes work. Add or change theme colors in that `@theme` block, not the JS config.

## Conventions

- Source comments and seed data are in Spanish; keep that language when editing existing Spanish comments, but write new code-level comments only when the "why" is non-obvious.
- SQL uses `camelCase` identifiers (unusual for SQLite but consistent across the schema). Rust structs use `snake_case` fields and rely on serde `rename_all = "camelCase"` for the frontend boundary — follow this pattern when adding new models.
- Vite is configured with `strictPort: true` on 1420 and ignores `src-tauri/**` from its watcher; don't change those without a reason.
- Do not rename tables/columns: schema compatibility with the production C# app's SQLite file is what makes migration a simple file copy.
