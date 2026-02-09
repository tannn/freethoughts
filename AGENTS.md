# Free Thought v0 - Agent Operating Guide

Free Thought is a macOS-first Electron app for reviewing documents and annotating alongside AI. Data is stored locally (SQLite + files), supported inputs are `.pdf` (text), `.txt`, and `.md`, and AI generation uses OpenAI APIs or Codex App Server depending on auth mode; no web/mobile clients or OCR/search/export features are in scope.

## 1) Purpose

This file defines worker execution rules for this repository.

Repository: `freethoughts`

## 2) Scope Snapshot (v0)

In scope (see `requirements.md`):
- Section-anchored notes with optional selection metadata (`FR-021`, `FR-021C`, `DR-003A`)
- On-demand provocations (`FR-040` to `FR-044A`)
- Notes-first two-pane reader (`FR-020F`, `FR-020G`, `FR-026`, `FR-029A`)
- Controllable native `.pdf` renderer with deterministic selection-anchor mapping (`FR-020D`, `FR-020E`, `FR-020H`, `FR-021D`, `ND-012`)
- Deterministic ingestion/anchors/re-import behavior (`FR-013` to `FR-019F`, `FR-070` to `FR-072`, `ND-001` to `ND-006`)
- Dual auth mode routing (`FR-055` to `FR-059D`, `FR-085` to `FR-088`, `ND-007` to `ND-009`)

Out of scope for v0:
- OCR, search, export, collaborative editing, auto-update, code signing/notarization (`requirements.md` section 8)

## 3) Source-of-Truth Order

When docs conflict, resolve in this order:

1. `requirements.md` (pass/fail behavior)
2. `spec.md` (product + architecture detail)
3. `mockups.md` (current UX structure/states)
4. `implementation-plan.md` (phase strategy)
5. `task-board.md` (active execution queue)

If conflicts remain after this order, escalate.

## 4) Execution Model

- Execute only unblocked tickets from `task-board.md`.
- One ticket per worker unless coordinator reassigns.
- Do not start downstream phases early.
- Use `task-board.md` only (active statuses only). Historical and superseded tickets are in `task-board.archive.md`.

## 5) Branch + Ticket Rules

- Use ticket IDs from `task-board.md` (for example `TFT-001`).
- Branch naming: `codex/phase-<n>-<topic>`.
- Merge only after exit checks pass and coordinator approves.

## 6) Required Update Format

Every worker update must include:
- `Tests run`
- `Criteria met`
- `Blockers`

If no tests ran, explicitly state why.

## 7) Hard Invariants (Must Hold)

- Deterministic sectioning by file type (`FR-019A` to `FR-019D`, `ND-001` to `ND-003`)
- Deterministic `anchor_key` format (`FR-017`, `FR-019E`)
- Exact-match remap only on re-import (`FR-018`, `FR-019`, `FR-023A`)
- Atomic re-import/re-index transaction with rollback (`FR-071`, `FR-072`)
- Revision-scoped invalidation (`DR-005`, `DR-011`)
- Source files remain in place with path + fingerprint metadata (`FR-005`, `FR-006`, `DR-008`)
- PDF selection-anchor deterministic mapping constraints, including renderer security/perf parity (`FR-020D`, `FR-020E`, `FR-020H`, `FR-021D`, `ND-012`)

## 8) Security + IPC Baseline

- Electron hardening: `FR-060` to `FR-069`
- IPC envelope/validation/error codes: `FR-074` to `FR-076`
- Channel allowlist + auth orchestration channels: `FR-073`, `FR-085`
- No secrets in SQLite/logs; API keys in Keychain only (`FR-052`, `FR-057`, `DR-014` to `DR-016`)

## 9) Runtime Defaults

Use AI runtime defaults in `FR-080` to `FR-084` and deterministic context assembly in `ND-004` unless requirements change.

## 10) Testing + Benchmark Gates

Follow required behavior coverage and benchmark gates in `requirements.md` (`NFR-001` to `NFR-011`).

## 11) Scope Guardrails

Do not add out-of-scope features listed in `requirements.md` section 8 without explicit coordinator approval.

## 12) Context Hygiene

- Read this guide first, then only the requirement/spec sections needed for the current ticket.
- Do not use archive docs unless validating history.
- Prefer requirement IDs over repeated prose in implementation notes and tickets.

## 13) Escalation Conditions

Escalate when there is:
- requirement/spec mismatch affecting behavior
- missing dependency for current ticket
- security baseline conflict
- cross-phase data model change
- failing gate criteria requiring cross-team changes

## 14) Archive

Historical update logs and prior operating text are in `AGENTS.archive.md`.
