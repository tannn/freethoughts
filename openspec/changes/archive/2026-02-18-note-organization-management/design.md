## Context

Notes are managed by `NotesFeature` (TCA reducer) and displayed in `NotesSidebar` as a `LazyVStack` of `NoteCard` views. State is value-typed (`NoteItem` is `Equatable/Identifiable/Sendable`) and lives entirely in `NotesFeature.State`. The sidebar header already has a note-count badge; toolbar space is intentionally conserved using icon-only buttons per the updated proposal.

Single-note deletion already flows through a confirmation dialog (`confirmingDeleteNoteId`). No persistence layer changes are needed for collapse or search — these are display-layer concerns only. Delete-all and multi-select deletion do require calling `notesClient.deleteNote` per note.

## Goals / Non-Goals

**Goals:**
- Add per-note collapse/expand and a global toggle-all control
- Add real-time in-memory search/filter by title (selected text excerpt) or content
- Add a "delete all" action with confirmation
- Add multi-select mode to mark and delete a subset of notes
- All new state follows existing TCA patterns (value types, `Equatable`, no SwiftData in state)

**Non-Goals:**
- Persisting collapse state across sessions
- Server-side or file-backed search indexing
- Reordering notes
- Keyboard navigation / accessibility beyond standard SwiftUI defaults

## Decisions

### 1. Collapse state: `Set<UUID>` in `NotesFeature.State`

Track which notes are collapsed as `collapsedNoteIds: Set<UUID>`. Lookup is O(1), the set contains only IDs (value types), and it satisfies `Equatable` automatically. Collapsed state is ephemeral — it resets when notes reload, which is acceptable.

_Alternative considered_: a `Bool` field on `NoteItem`. Rejected because it would bleed display state into the model and require persistence changes.

### 2. Search: computed filter, `searchQuery: String` in state

Add `searchQuery: String` to state. `NotesSidebar` consumes a computed `filteredNotes` derived from `store.notes` filtered against `searchQuery` (case-insensitive match on `selectedText` or `content`). No new client methods needed.

The search field renders as a `TextField` with a magnifying-glass icon inside the sidebar, below the header divider, always visible when there is at least one note.

### 3. Multi-select deletion: mode flag + `Set<UUID>`

Add `isSelectingForDeletion: Bool` and `selectedNoteIds: Set<UUID>` to state. Entering select mode shows a checkbox overlay on each `NoteCard`. A "Delete Selected" button in the header is enabled when `selectedNoteIds` is non-empty. Exiting mode (cancel or after deletion) clears both fields.

`NoteCard` gains an optional `isSelected: Bool` and `onToggleSelection: (() -> Void)?` parameter. When non-nil, a checkmark overlay is shown; the card is otherwise read-only (editing disabled in select mode).

### 4. Delete all: parallel effects, reuse existing client

`deleteAll` action dispatches concurrent `notesClient.deleteNote` calls for all current note IDs using `withTaskGroup`. Individual `noteDeleted` actions remove notes from state as they complete. A single confirmation dialog (reusing the existing `confirmationDialog` pattern) guards the action.

_Alternative_: a new `notesClient.deleteAllNotes()` method. Rejected to avoid unnecessary `NotesClient` surface area when composition of existing calls is sufficient.

### 5. Toolbar: icon-only buttons in the sidebar header `HStack`

New controls are placed as `Button` views with `Label(..., systemImage:)` rendered icon-only (`.labelStyle(.iconOnly)`) in the existing header `HStack`. Order (left to right after the count badge): search toggle, collapse-all, select mode, delete all.

The search bar itself appears as a collapsible row below the header divider, toggled by the search icon button, to avoid permanently consuming vertical space.

## Risks / Trade-offs

- **Collapse state lost on reload**: Intentional trade-off for simplicity. If the document is reloaded, all notes re-expand. Acceptable for v1.
- **Parallel delete-all on slow storage**: If `notesClient.deleteNote` is slow or fails mid-batch, some notes may be deleted and others not. Mitigation: collect failures and surface a single aggregated error; failed IDs remain in state.
- **Search while editing**: If a user is editing a note and types a query that filters it out, the card disappears mid-edit. Mitigation: include `editingNoteId` in filtered results regardless of query match.
- **Select mode + editing conflict**: Entering select mode while a note is being edited could leave editing state dangling. Mitigation: entering select mode dispatches `stopEditing` first.

## Migration Plan

No data migration needed. All changes are additive to `NotesFeature.State` and `NotesSidebar`/`NoteCard` views. Existing confirmation-dialog pattern for single-note delete is preserved unchanged.
