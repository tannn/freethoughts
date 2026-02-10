# Free Thoughts v0

## Task Board (Active Only)

This board contains unresolved work only (`TODO`, `IN_PROGRESS`, `PARKED`).
Completed and historical queues are archived in `task-board.archive.md`.

## 1. Status legend

- `TODO`: not started
- `IN_PROGRESS`: active implementation
- `PARKED`: intentionally paused (scope/dependency conflict)

## 2. Phase gates

- Items in the same phase can be worked in parallel.

## 3. Active ticket queue

### TFT-006
- Type: Bug
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: Note-attached provocations persist across restart and remain attached to their notes (`FR-042A`, `FR-044`, `FR-049`).
- Description: After restart, provocations generated for specific notes are no longer attached to those notes. Investigate persistence/rehydration and restore correct note association so note-level provocations appear under the originating note after reload.
- Exit Checks: Generate a note-level provocation, restart the app, and confirm the provocation still renders under the same note; no regression to section-level provocation ordering or deletion behavior.

### TFT-004
- Type: Story
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: App name updated to `Free Thoughts` across menu bar, window title, renderer shell, and docs (`FR-006B`, spec §5, mockups §1).
- Description: Replace all user-visible references to "Free Thought" with "Free Thoughts" in the app shell, main-process metadata, renderer title/header, and related tests/docs so the product name is consistent.
- Exit Checks: App menu bar and main window title show `Free Thoughts`; renderer title/header show `Free Thoughts`; related tests pass.

### TFT-005
- Type: Story
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: Electron bundling workflow produces a macOS app bundle named `Free Thoughts` (`FR-006C`, spec §5).
- Description: Add or validate an Electron bundling pipeline for macOS distribution that outputs a `Free Thoughts` app bundle and document the command entrypoint.
- Exit Checks: Bundling command produces a macOS app bundle named `Free Thoughts`; build scripts/docs reflect the bundling workflow.

### TFT-007
- Type: Bug
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: Packaged macOS app can import/open PDFs without `Failed to read PDF metadata` errors (`FR-010`, `FR-019C`).
- Description: When the app is packaged with electron-packager, PDF import fails with `E_INTERNAL: Failed to read PDF metadata`. Investigate PDF metadata extraction in packaged apps and ensure the runtime can locate PDF tooling when launched from Finder.
- Exit Checks: In the packaged app, importing a text-based PDF succeeds and PDF metadata/text extraction runs without `Failed to read PDF metadata` errors.

### TFT-009
- Type: Bug
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: Note/provocation overlay displays for selections that span multiple lines in a paragraph within PDFs; selection visuals align with text and not margins.
- Description: When selecting text spanning multiple lines in a paragraph on a PDF, the note/provocation overlay does not display. There appears to be an unrelated selection on the margins that may be causing the overlay to mis-position or not render. Reproduce by opening a text-based PDF, selecting a paragraph that wraps lines, and observing that the overlay fails to appear; inspect selection anchors and bounding boxes.
- Exit Checks: Selecting multi-line paragraph text in a PDF shows the note/provocation overlay positioned over the selection; selection bounding boxes correspond to text (not margins); verify behavior across multiple PDFs and document types.

### TFT-010
- Type: Story
- Phase: 25
- Depends on: None
- Status: TODO
- Deliverable: Outline drawer is labeled Documents and the Sections selector is removed while section logic remains intact.
- Description: Rename the Outline button and drawer header to Documents. Remove the Sections selector from the outline/document drawer without deleting section logic so document/section state remains unchanged.
- Exit Checks: Top-bar button reads Documents; drawer header reads Documents; Sections selector is not visible in the drawer; opening a document still loads its first section.
