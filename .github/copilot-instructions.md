# Free Thought v0 - Agent Brief

This is the fast-start brief for AI workers. For full detail, use the source-of-truth docs below.

## 1) Source-of-Truth Order

1. `requirements.md` (pass/fail behavior)
2. `spec.md` (product + architecture detail)
3. `mockups.md` (current UX structure/states)
4. `implementation-plan.md` (phase strategy)
5. `task-board.md` (active execution queue)

If conflicts remain after this order, escalate.

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

## 3) Non-Negotiable Invariants

- Deterministic anchors: `<normalized_heading_slug>#<ordinal>` (`FR-017`, `FR-019E`)
- Re-import remap by exact `anchor_key` only (`FR-018`, `FR-019`, `FR-023A`)
- Atomic re-import transaction + rollback (`FR-071`, `FR-072`)
- Revision-scoped invalidation for cached provocations (`DR-005`, `DR-011`)
- Source files stay in place; persist fingerprint metadata (`FR-005`, `FR-006`, `DR-008`)
- PDF selection anchors in native view must use deterministic renderer-event mapping (`FR-020D`, `FR-020E`, `FR-021D`, `ND-012`)

## 4) Security + IPC Baseline

- Electron hardening: `FR-060` to `FR-069`
- IPC envelope/validation/error codes: `FR-074` to `FR-076`
- Channel allowlist + auth orchestration channels: `FR-073`, `FR-085`
- No secrets in SQLite/logs; API keys in Keychain only (`FR-052`, `FR-057`, `DR-014` to `DR-016`)

## 5) Runtime Defaults

- Timeout/retry/cancel/token/model defaults: `FR-080` to `FR-084`
- Deterministic context assembly: `ND-004`

## 6) Active Work Queue

Use `task-board.md` only (active statuses only). Historical and superseded tickets are in `task-board.archive.md`.

## 7) Required Worker Update Format

Every update must include:
- `Tests run`
- `Criteria met`
- `Blockers`

If no tests ran, state why.

## 8) Context Hygiene

- Read `AGENT_BRIEF.md` first, then only the requirement/spec sections needed for the current ticket.
- Do not use archive docs unless validating history.
- Prefer requirement IDs over repeated prose in implementation notes and tickets.
