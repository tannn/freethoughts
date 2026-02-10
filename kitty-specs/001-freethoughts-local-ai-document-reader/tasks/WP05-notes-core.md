---
work_package_id: WP05
title: Notes Core
lane: "for_review"
dependencies: []
base_branch: main
base_commit: b2555c95ab8a23d580ca2941c45d291b59f2a6d3
created_at: '2026-02-10T18:41:07.276374+00:00'
subtasks: [T025, T026, T027, T028, T029, T030]
shell_pid: "54778"
agent: "claude-opus"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP05: Notes Core

## Objective

Implement the core notes feature including the sidebar, note cards, creation flow, and SwiftData persistence.

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP04 (Text Selection)

Reference documents:
- [mockups.md](../mockups.md) - Main layout (#1), note creation (#4)
- [data-model.md](../data-model.md) - Note entity schema
- [spec.md](../spec.md) - FR-007 to FR-011

---

## Subtask T025: Create NotesFeature Reducer

**Purpose**: Implement full TCA reducer for notes management.

**Steps**:

1. Update `Features/Notes/NotesFeature.swift`:

```swift
import ComposableArchitecture
import SwiftData
import Foundation

@Reducer
struct NotesFeature {
    @ObservableState
    struct State: Equatable {
        var notes: [Note] = []
        var currentDocumentPath: String?
        var isCreatingNote: Bool = false
        var noteCreationSelection: TextSelection?
        var noteCreationContent: String = ""
        var editingNoteId: UUID?
    }

    enum Action {
        case loadNotes(documentPath: String)
        case notesLoaded([Note])
        case startNoteCreation(TextSelection)
        case cancelNoteCreation
        case updateNoteContent(String)
        case saveNote
        case noteSaved(Note)
        case deleteNote(UUID)
        case noteDeleted(UUID)
        case startEditing(UUID)
        case stopEditing
        case updateNoteText(UUID, String)
        case navigateToNote(UUID)
    }

    @Dependency(\.notesClient) var notesClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .loadNotes(let path):
                state.currentDocumentPath = path
                return .run { send in
                    let notes = try await notesClient.loadNotes(path)
                    await send(.notesLoaded(notes))
                }

            case .notesLoaded(let notes):
                state.notes = notes.sorted { $0.anchorStart < $1.anchorStart }
                return .none

            case .startNoteCreation(let selection):
                state.isCreatingNote = true
                state.noteCreationSelection = selection
                state.noteCreationContent = ""
                return .none

            case .cancelNoteCreation:
                state.isCreatingNote = false
                state.noteCreationSelection = nil
                state.noteCreationContent = ""
                return .none

            case .updateNoteContent(let content):
                state.noteCreationContent = content
                return .none

            case .saveNote:
                guard let selection = state.noteCreationSelection else {
                    return .none
                }

                let note = Note(
                    documentPath: selection.documentPath,
                    anchorStart: selection.range.startOffset,
                    anchorEnd: selection.range.endOffset,
                    anchorPage: selection.range.page,
                    selectedText: selection.text,
                    content: state.noteCreationContent
                )

                state.isCreatingNote = false
                state.noteCreationSelection = nil
                state.noteCreationContent = ""

                return .run { send in
                    let saved = try await notesClient.saveNote(note)
                    await send(.noteSaved(saved))
                }

            case .noteSaved(let note):
                state.notes.append(note)
                state.notes.sort { $0.anchorStart < $1.anchorStart }
                return .none

            case .deleteNote(let id):
                return .run { send in
                    try await notesClient.deleteNote(id)
                    await send(.noteDeleted(id))
                }

            case .noteDeleted(let id):
                state.notes.removeAll { $0.id == id }
                return .none

            case .startEditing(let id):
                state.editingNoteId = id
                return .none

            case .stopEditing:
                state.editingNoteId = nil
                return .none

            case .updateNoteText(let id, let text):
                if let index = state.notes.firstIndex(where: { $0.id == id }) {
                    state.notes[index].content = text
                    state.notes[index].updatedAt = Date()
                    let note = state.notes[index]
                    return .run { _ in
                        try await notesClient.saveNote(note)
                    }
                }
                return .none

            case .navigateToNote:
                // Handled by parent to scroll document
                return .none
            }
        }
    }
}
```

**Files**:
- `Features/Notes/NotesFeature.swift` (~120 lines)

**Validation**:
- [ ] All actions implemented
- [ ] State updates correctly
- [ ] Notes sorted by position

---

## Subtask T026: Create NotesSidebar View

**Purpose**: Implement the collapsible sidebar showing all notes for the current document.

**Steps**:

1. Create `Features/Notes/NotesSidebar.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct NotesSidebar: View {
    @Bindable var store: StoreOf<NotesFeature>

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("NOTES")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(store.notes.count)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }
            .padding()

            Divider()

            // Notes list
            if store.notes.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(store.notes, id: \.id) { note in
                            NoteCard(
                                note: note,
                                isEditing: store.editingNoteId == note.id,
                                onTap: {
                                    store.send(.navigateToNote(note.id))
                                },
                                onEdit: {
                                    store.send(.startEditing(note.id))
                                },
                                onSave: { text in
                                    store.send(.updateNoteText(note.id, text))
                                    store.send(.stopEditing)
                                },
                                onDelete: {
                                    store.send(.deleteNote(note.id))
                                },
                                onProvocation: {
                                    // Handled in WP08
                                }
                            )
                        }
                    }
                    .padding()
                }
            }
        }
        .frame(minWidth: 250, idealWidth: 280, maxWidth: 350)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: "note.text")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)

            Text("No notes yet")
                .foregroundStyle(.tertiary)

            Text("Select text to create a note")
                .font(.caption)
                .foregroundStyle(.quaternary)

            Spacer()
        }
    }
}
```

**Files**:
- `Features/Notes/NotesSidebar.swift` (~80 lines)

**Validation**:
- [ ] Header shows note count
- [ ] Notes display in scrollable list
- [ ] Empty state shows when no notes

---

## Subtask T027: Create NoteCard Component

**Purpose**: Create the note card component per mockup specifications.

**Steps**:

1. Create `Features/Notes/NoteCard.swift`:

```swift
import SwiftUI

struct NoteCard: View {
    let note: Note
    let isEditing: Bool
    let onTap: () -> Void
    let onEdit: () -> Void
    let onSave: (String) -> Void
    let onDelete: () -> Void
    let onProvocation: () -> Void

    @State private var editText: String = ""
    @State private var showDeleteConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Selected text excerpt (clickable to navigate)
            Button(action: onTap) {
                Text(truncatedExcerpt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
            }
            .buttonStyle(.plain)

            // Note content
            if isEditing {
                editingView
            } else {
                contentView
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .confirmationDialog(
            "Delete Note",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var truncatedExcerpt: String {
        let excerpt = note.selectedText.prefix(100)
        return excerpt.count < note.selectedText.count
            ? "\"\(excerpt)...\""
            : "\"\(excerpt)\""
    }

    private var contentView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(note.content.isEmpty ? "No content" : note.content)
                .foregroundStyle(note.content.isEmpty ? .tertiary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onTapGesture(count: 2) {
                    editText = note.content
                    onEdit()
                }

            HStack {
                Spacer()

                Button {
                    onProvocation()
                } label: {
                    Label("AI", systemImage: "sparkles")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var editingView: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $editText)
                .font(.body)
                .frame(minHeight: 60)
                .scrollContentBackground(.hidden)
                .padding(4)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))

            HStack {
                Button("Delete", role: .destructive) {
                    showDeleteConfirmation = true
                }
                .font(.caption)

                Spacer()

                Button("Done") {
                    onSave(editText)
                }
                .font(.caption)
                .buttonStyle(.borderedProminent)
            }
        }
        .onAppear {
            editText = note.content
        }
    }
}
```

**Files**:
- `Features/Notes/NoteCard.swift` (~120 lines)

**Validation**:
- [ ] Excerpt shows truncated selected text
- [ ] Content displays with proper styling
- [ ] Double-click enters edit mode
- [ ] AI button visible in footer

---

## Subtask T028: Create Note Creation Sheet

**Purpose**: Implement the modal sheet for creating new notes (mockup #4).

**Steps**:

1. Create `Features/Notes/NoteCreationSheet.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct NoteCreationSheet: View {
    @Bindable var store: StoreOf<NotesFeature>
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("New Note")
                    .font(.headline)

                Spacer()

                Button {
                    store.send(.cancelNoteCreation)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Selected text context
            if let selection = store.noteCreationSelection {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Selected text:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("\"\(selection.text)\"")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                }
            }

            // Note input
            VStack(alignment: .leading, spacing: 4) {
                Text("Your note:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextEditor(text: Binding(
                    get: { store.noteCreationContent },
                    set: { store.send(.updateNoteContent($0)) }
                ))
                .font(.body)
                .frame(minHeight: 100)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                .focused($isFocused)
            }

            Divider()

            // Actions
            HStack {
                Spacer()

                Button("Cancel") {
                    store.send(.cancelNoteCreation)
                }
                .keyboardShortcut(.escape)

                Button("Save Note") {
                    store.send(.saveNote)
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 500)
        .onAppear {
            isFocused = true
        }
    }
}
```

2. Add sheet presentation to ContentView:

```swift
.sheet(isPresented: Binding(
    get: { store.notes.isCreatingNote },
    set: { if !$0 { store.send(.notes(.cancelNoteCreation)) } }
)) {
    NoteCreationSheet(
        store: store.scope(state: \.notes, action: \.notes)
    )
}
```

**Files**:
- `Features/Notes/NoteCreationSheet.swift` (~100 lines)
- `App/ContentView.swift` (add sheet)

**Validation**:
- [ ] Sheet shows selected text context
- [ ] Text editor focuses on appear
- [ ] Cancel and Save work correctly
- [ ] ⌘Enter saves, Escape cancels

---

## Subtask T029: Implement Note Persistence

**Purpose**: Create NotesClient for SwiftData operations.

**Steps**:

1. Create `Features/Notes/NotesClient.swift`:

```swift
import ComposableArchitecture
import SwiftData
import Foundation

@DependencyClient
struct NotesClient {
    var loadNotes: @Sendable (_ documentPath: String) async throws -> [Note]
    var saveNote: @Sendable (_ note: Note) async throws -> Note
    var deleteNote: @Sendable (_ id: UUID) async throws -> Void
}

extension NotesClient: DependencyKey {
    static let liveValue: NotesClient = {
        // Note: In real implementation, inject ModelContainer
        @Dependency(\.modelContainer) var container

        return NotesClient(
            loadNotes: { documentPath in
                let context = ModelContext(container)
                let predicate = #Predicate<Note> { note in
                    note.documentPath == documentPath
                }
                let descriptor = FetchDescriptor(predicate: predicate, sortBy: [SortDescriptor(\.anchorStart)])
                return try context.fetch(descriptor)
            },
            saveNote: { note in
                let context = ModelContext(container)
                context.insert(note)
                try context.save()
                return note
            },
            deleteNote: { id in
                let context = ModelContext(container)
                let predicate = #Predicate<Note> { note in
                    note.id == id
                }
                let descriptor = FetchDescriptor(predicate: predicate)
                if let note = try context.fetch(descriptor).first {
                    context.delete(note)
                    try context.save()
                }
            }
        )
    }()

    static let testValue = NotesClient(
        loadNotes: { _ in [] },
        saveNote: { $0 },
        deleteNote: { _ in }
    )
}

extension DependencyValues {
    var notesClient: NotesClient {
        get { self[NotesClient.self] }
        set { self[NotesClient.self] = newValue }
    }
}
```

**Files**:
- `Features/Notes/NotesClient.swift` (~60 lines)

**Validation**:
- [ ] Notes save to SwiftData
- [ ] Notes load for current document
- [ ] Notes delete correctly

---

## Subtask T030: Implement Note Loading

**Purpose**: Load notes when document changes.

**Steps**:

1. Connect note loading to document changes in AppFeature:

```swift
// In AppFeature reducer
case .document(.documentLoaded(let document)):
    return .send(.notes(.loadNotes(documentPath: document.canonicalPath)))
```

2. Ensure notes clear when document closes:

```swift
case .document(.closeDocument):
    return .send(.notes(.loadNotes(documentPath: "")))
```

**Files**:
- `App/AppFeature.swift` (update)

**Validation**:
- [ ] Notes load when document opens
- [ ] Notes refresh when switching documents
- [ ] Notes clear when document closes

---

## Definition of Done

- [ ] Notes feature reducer fully implemented
- [ ] Sidebar displays notes with count
- [ ] Note cards show excerpt and content
- [ ] Note creation sheet works correctly
- [ ] Notes persist to SwiftData
- [ ] Notes load when document opens

## Risks

| Risk | Mitigation |
|------|------------|
| SwiftData threading | Use separate context for operations |
| Note sync with document | Clear notes on document change |

## Reviewer Guidance

1. Test note creation flow end-to-end
2. Verify notes persist after app restart
3. Test switching between documents
4. Check sidebar empty state
5. Verify note card interactions

## Activity Log

- 2026-02-10T18:41:07Z – GitHub Copilot – shell_pid=49309 – lane=doing – Assigned agent via workflow command
- 2026-02-10T18:54:08Z – GitHub Copilot – shell_pid=49309 – lane=planned – Moved back to planned at user request.
- 2026-02-10T19:01:00Z – claude-opus – shell_pid=54778 – lane=doing – Started implementation via workflow command
- 2026-02-10T19:07:15Z – claude-opus – shell_pid=54778 – lane=for_review – Ready for review: Full notes core implementation with TCA reducer, sidebar, note cards, creation sheet, SwiftData persistence, and AppFeature wiring. Build succeeds.
