# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run tauri dev` — run the full desktop app (spawns Vite on port 1420 and the Rust backend). Use this, not `npm run dev` alone, when you need the Tauri bridge.
- `npm run dev` — frontend-only Vite dev server. `window.__TAURI__` will be undefined, so any `invoke()` calls will fail.
- `npm run build` — runs `tsc` (type-check, no emit) then `vite build` into `dist/`. Used by Tauri as `beforeBuildCommand`.
- `npm run tauri build` — production desktop bundle.
- `cargo check` / `cargo build` inside `src-tauri/` — compile the Rust side without launching the app.

No test runner, linter, or formatter is configured. Type errors surface only through `tsc` via `npm run build`.

## Architecture

Tauri 2 desktop app with a React 19 + TypeScript frontend and a Rust backend.

**Frontend entry:** `src/main.tsx` → `src/App.tsx`. Currently a static landing page — routing, queries, and forms libraries are installed (`react-router-dom` v7, `@tanstack/react-query` v5, `react-hook-form` + `zod`) but not yet wired up.

**Backend entry:** `src-tauri/src/main.rs` → `casino_counter_lib::run()` in `lib.rs`. The crate is named `casino_counter_lib` (the `_lib` suffix is a Windows/Cargo workaround — don't rename it). Tauri commands are registered via `tauri::generate_handler![...]` in `lib.rs`.

**Database layer (`src-tauri/src/database/`):** SQLite via `rusqlite` with the `bundled` feature (no system SQLite needed). This module is **not yet wired into `lib.rs`** — adding a call to `database::init_database()` from `run()` and managing the `Connection` via Tauri state is the next integration step.

- `mod.rs` — opens `casino_counter.db` in the current working directory (dev-only path; production should use `app_data_dir`), sets WAL + foreign keys, creates tables, runs seed.
- `models.rs` — Rust structs mirror DB rows. They use `#[serde(rename_all = "camelCase")]` so the JSON exposed to the frontend matches the camelCase SQL column names (e.g. `userId`, `numberMachine`).
- `seed.rs` — idempotent seed: inserts Roles, default Admin/Operator users, machine types, and coin denominations only if `Role` is empty.

**Schema shape** (see `create_tables` in `database/mod.rs` for the source of truth): `Role` → `Users`; `Route`, `TypeMachine`, `CoinType` → `Machine` → `InfoMachine` (1:1 client details) and `CounterRecord` (meter readings: `counterIn`, `counterOut`, `totalDelivered`). All FKs are enforced at runtime via `PRAGMA foreign_keys = ON`.

**Styling:** Tailwind CSS v4 via `@tailwindcss/postcss` (note: v4, not v3 — config shape and plugin are different). Custom `navy` palette is defined in `tailwind.config.js`.

## Conventions

- Source comments and seed data are in Spanish; keep that language when editing existing Spanish comments, but write new code-level comments only when the "why" is non-obvious.
- SQL uses `camelCase` identifiers (unusual for SQLite but consistent across the schema). Rust structs use `snake_case` fields and rely on serde `rename_all = "camelCase"` for the frontend boundary — follow this pattern when adding new models.
- Vite is configured with `strictPort: true` on 1420 and ignores `src-tauri/**` from its watcher; don't change those without a reason.
