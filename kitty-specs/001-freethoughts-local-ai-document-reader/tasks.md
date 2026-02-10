# Tasks: FreeThoughts - Local AI Document Reader

**Feature**: 001-freethoughts-local-ai-document-reader
**Created**: 2026-02-09
**Status**: Planning Complete

## Overview

This document breaks down the FreeThoughts implementation into work packages and subtasks. Each work package targets 5-7 subtasks for manageable scope.

**Total Subtasks**: 53
**Total Work Packages**: 9
**Estimated Prompt Size**: 300-400 lines per WP

---

## Phase 1: Foundation Setup

### WP01: Project Foundation

**Goal**: Create Xcode project with TCA architecture, SwiftData persistence, and basic app shell.

**Priority**: P0 (blocking)
**Dependencies**: None
**Prompt**: [WP01-project-foundation.md](tasks/WP01-project-foundation.md)
**Estimated Lines**: ~350

**Included Subtasks**:
- [x] T001: Create Xcode project with folder structure per plan.md
- [x] T002: Add TCA dependency via Swift Package Manager
- [x] T003: Create FreeThoughtsApp.swift entry point with SwiftData container
- [x] T004: Create root AppFeature reducer composing child features
- [x] T005: Set up SwiftData ModelContainer with schema
- [x] T006: Create SwiftData models (Note, Provocation, ProvocationPrompt)
- [x] T007: Create basic main window with NavigationSplitView layout

**Success Criteria**:
- App launches with empty window
- SwiftData container initializes without errors
- TCA store compiles and runs

---

## Phase 2: Document Viewing

### WP02: Document Rendering

**Goal**: Implement document models and all three format renderers (PDF, Markdown, Plain Text).

**Priority**: P1
**Dependencies**: WP01
**Prompt**: [WP02-document-rendering.md](tasks/WP02-document-rendering.md)
**Estimated Lines**: ~400

**Included Subtasks**:
- [x] T008: Create Document model (transient struct with URL, type, content)
- [x] T009: Create DocumentClient dependency for file loading operations
- [x] T010: Create DocumentFeature reducer with state and actions
- [x] T011: Create PDFRenderer with PDFView via NSViewRepresentable
- [x] T012: Create MarkdownRenderer using AttributedString
- [x] T013: Create PlainTextRenderer with ScrollView + Text
- [x] T014: Create unified DocumentView that switches between renderers

**Success Criteria**:
- PDF files render with correct layout
- Markdown files render with proper formatting
- Plain text files display with readable typography
- Smooth scrolling in all formats

---

### WP03: File Opening & Navigation

**Goal**: Implement all file opening methods and document navigation UI.

**Priority**: P1
**Dependencies**: WP02
**Prompt**: [WP03-file-opening.md](tasks/WP03-file-opening.md)
**Estimated Lines**: ~300

**Included Subtasks**:
- [x] T015: Implement File > Open menu command
- [x] T016: Implement ⌘O keyboard shortcut
- [x] T017: Implement drag-and-drop file opening on window
- [x] T018: Create empty state view (mockup #2)
- [x] T019: Create status bar with page info, zoom, and document type

**Success Criteria**:
- Files open via menu, keyboard, and drag-drop
- Empty state shows clear call-to-action
- Status bar displays accurate document info

---

## Phase 3: Text Selection & Notes

### WP04: Text Selection

**Goal**: Track text selection across all document formats and show action popover.

**Priority**: P1
**Dependencies**: WP02
**Prompt**: [WP04-text-selection.md](tasks/WP04-text-selection.md)
**Estimated Lines**: ~320

**Included Subtasks**:
- [x] T020: Track PDF text selection via PDFSelection delegate
- [x] T021: Track text selection for markdown/plain text views
- [x] T022: Create unified TextSelection model with position data
- [x] T023: Create selection action popover (mockup #3)
- [x] T024: Handle popover positioning and dismissal

**Success Criteria**:
- Text selection works in all three formats
- Popover appears below selection with correct actions
- Popover dismisses on outside click or Escape

---

### WP05: Notes Core

**Goal**: Implement notes feature with sidebar, creation flow, and persistence.

**Priority**: P1
**Dependencies**: WP04
**Prompt**: [WP05-notes-core.md](tasks/WP05-notes-core.md)
**Estimated Lines**: ~400

**Included Subtasks**:
- [ ] T025: Create NotesFeature reducer with state/actions
- [ ] T026: Create NotesSidebar view component
- [ ] T027: Create NoteCard component per mockup
- [ ] T028: Create note creation sheet (mockup #4)
- [ ] T029: Implement note persistence (save to SwiftData)
- [ ] T030: Implement note loading for current document

**Success Criteria**:
- Notes appear in sidebar after creation
- Notes persist across app restarts
- Notes load correctly when switching documents

---

### WP06: Notes Polish

**Goal**: Complete notes feature with ordering, editing, deletion, and navigation.

**Priority**: P1
**Dependencies**: WP05
**Prompt**: [WP06-notes-polish.md](tasks/WP06-notes-polish.md)
**Estimated Lines**: ~350

**Included Subtasks**:
- [ ] T031: Order notes by anchor position in document
- [ ] T032: Implement inline note editing (mockup #9)
- [ ] T033: Implement note deletion with confirmation
- [ ] T034: Implement navigation from note to anchor (mockup #10)
- [ ] T035: Implement sidebar collapse/expand (mockup #8)

**Success Criteria**:
- Notes ordered top-to-bottom by position
- Inline editing saves on Done or focus loss
- Click note header scrolls to anchor with highlight
- Sidebar collapses to thin strip with note count

---

## Phase 4: AI Provocations

### WP07: AI Foundation

**Goal**: Set up Foundation Models integration, prompts, and availability checking.

**Priority**: P2
**Dependencies**: WP01
**Prompt**: [WP07-ai-foundation.md](tasks/WP07-ai-foundation.md)
**Estimated Lines**: ~380

**Included Subtasks**:
- [x] T036: Create FoundationModelsClient TCA dependency
- [x] T037: Implement availability checking (isSupported)
- [x] T038: Create ProvocationPrompt persistence operations
- [x] T039: Create DefaultPrompts.json with 4 default styles
- [x] T040: Seed default prompts on first launch
- [x] T041: Create ProvocationFeature reducer with state/actions

**Success Criteria**:
- AI availability correctly detected
- Default prompts load on first launch
- ProvocationFeature integrates with AppFeature

---

### WP08: AI Provocations UI

**Goal**: Implement provocation flows for text selection and notes with streaming display.

**Priority**: P2
**Dependencies**: WP07, WP05
**Prompt**: [WP08-ai-provocations-ui.md](tasks/WP08-ai-provocations-ui.md)
**Estimated Lines**: ~420

**Included Subtasks**:
- [ ] T042: Create provocation style picker sheet (mockup #5)
- [ ] T043: Implement provocation on text selection
- [ ] T044: Implement provocation on notes via AI button (mockup #11)
- [ ] T045: Create loading state UI (mockup #6)
- [ ] T046: Implement streaming response display (mockup #7)
- [ ] T047: Persist provocations to SwiftData

**Success Criteria**:
- Style picker shows all prompt options
- Provocations generate for both text and notes
- Streaming response updates in real-time
- Provocations persist and reload with notes

---

## Phase 5: Polish & Error Handling

### WP09: Error Handling & Polish

**Goal**: Handle edge cases, add keyboard shortcuts, and polish animations.

**Priority**: P2
**Dependencies**: WP06, WP08
**Prompt**: [WP09-error-handling-polish.md](tasks/WP09-error-handling-polish.md)
**Estimated Lines**: ~350

**Included Subtasks**:
- [ ] T048: Handle corrupted/unreadable files with error alert
- [ ] T049: Detect and handle PDFs with no selectable text (mockup #13)
- [ ] T050: Show AI unavailable message when Foundation Models not supported (mockup #12)
- [ ] T051: Implement all keyboard shortcuts per mockup table
- [ ] T052: Add smooth animations (sidebar collapse, scroll-to-anchor)
- [ ] T053: Handle large documents gracefully (progressive loading message)

**Success Criteria**:
- Errors display user-friendly messages
- All keyboard shortcuts work correctly
- Animations are smooth (60fps)
- Large files don't freeze the UI

---

## Subtask Index

| ID | Description | WP | Status |
|----|-------------|-----|--------|
| T001 | Create Xcode project | WP01 | ⬜ |
| T002 | Add TCA dependency | WP01 | ⬜ |
| T003 | Create app entry point | WP01 | ⬜ |
| T004 | Create AppFeature reducer | WP01 | ⬜ |
| T005 | Set up SwiftData container | WP01 | ⬜ |
| T006 | Create SwiftData models | WP01 | ⬜ |
| T007 | Create main window layout | WP01 | ⬜ |
| T008 | Create Document model | WP02 | ⬜ |
| T009 | Create DocumentClient | WP02 | ⬜ |
| T010 | Create DocumentFeature | WP02 | ⬜ |
| T011 | Create PDFRenderer | WP02 | ⬜ |
| T012 | Create MarkdownRenderer | WP02 | ⬜ |
| T013 | Create PlainTextRenderer | WP02 | ⬜ |
| T014 | Create DocumentView | WP02 | ⬜ |
| T015 | File > Open menu | WP03 | ⬜ |
| T016 | ⌘O keyboard shortcut | WP03 | ⬜ |
| T017 | Drag-and-drop opening | WP03 | ⬜ |
| T018 | Empty state view | WP03 | ⬜ |
| T019 | Status bar | WP03 | ⬜ |
| T020 | PDF text selection | WP04 | ⬜ |
| T021 | Text/Markdown selection | WP04 | ⬜ |
| T022 | TextSelection model | WP04 | ⬜ |
| T023 | Selection popover | WP04 | ⬜ |
| T024 | Popover positioning | WP04 | ⬜ |
| T025 | NotesFeature reducer | WP05 | ⬜ |
| T026 | NotesSidebar view | WP05 | ⬜ |
| T027 | NoteCard component | WP05 | ⬜ |
| T028 | Note creation sheet | WP05 | ⬜ |
| T029 | Note persistence | WP05 | ⬜ |
| T030 | Note loading | WP05 | ⬜ |
| T031 | Note ordering | WP06 | ⬜ |
| T032 | Inline note editing | WP06 | ⬜ |
| T033 | Note deletion | WP06 | ⬜ |
| T034 | Note-to-anchor navigation | WP06 | ⬜ |
| T035 | Sidebar collapse | WP06 | ⬜ |
| T036 | FoundationModelsClient | WP07 | ⬜ |
| T037 | AI availability check | WP07 | ⬜ |
| T038 | Prompt persistence | WP07 | ⬜ |
| T039 | DefaultPrompts.json | WP07 | ⬜ |
| T040 | Seed default prompts | WP07 | ⬜ |
| T041 | ProvocationFeature reducer | WP07 | ⬜ |
| T042 | Style picker sheet | WP08 | ⬜ |
| T043 | Text selection provocation | WP08 | ⬜ |
| T044 | Note provocation | WP08 | ⬜ |
| T045 | Loading state UI | WP08 | ⬜ |
| T046 | Streaming response | WP08 | ⬜ |
| T047 | Provocation persistence | WP08 | ⬜ |
| T048 | Corrupted file handling | WP09 | ⬜ |
| T049 | No-selectable-text handling | WP09 | ⬜ |
| T050 | AI unavailable message | WP09 | ⬜ |
| T051 | Keyboard shortcuts | WP09 | ⬜ |
| T052 | Animations | WP09 | ⬜ |
| T053 | Large document handling | WP09 | ⬜ |

---

## Dependency Graph

```
WP01 (Foundation)
  ├── WP02 (Rendering) ──┬── WP03 (File Opening)
  │                      └── WP04 (Selection) ── WP05 (Notes Core) ── WP06 (Notes Polish)
  │                                                    │
  └── WP07 (AI Foundation) ────────────────────────────┴── WP08 (AI UI) ── WP09 (Polish)
```

**Parallelization Opportunities**:
- After WP01: WP02 and WP07 can run in parallel
- After WP02: WP03 and WP04 can run in parallel
- After WP05 + WP07: WP06 and WP08 can partially overlap

---

## MVP Scope

**Minimum Viable Product**: WP01 + WP02 + WP03 + WP04 + WP05

This delivers:
- Document reading (PDF, markdown, text)
- File opening (all methods)
- Text selection
- Note creation and persistence
- Basic sidebar

**Full Feature**: All 9 work packages
