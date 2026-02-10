---
work_package_id: WP06
title: Notes Polish
lane: "planned"
dependencies: []
base_branch: main
base_commit: 6946f54996547120b25bdc1558e276f1ae2bf9c7
created_at: '2026-02-10T18:49:01.029971+00:00'
subtasks: [T031, T032, T033, T034, T035]
shell_pid: "51736"
agent: "claude-opus"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP06: Notes Polish

## Objective

Complete the notes feature with proper ordering, inline editing, deletion confirmation, navigation to anchors, and sidebar collapse.

## Implementation Command

```bash
spec-kitty implement WP06 --base WP05
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP05 (Notes Core)

Reference documents:
- [mockups.md](../mockups.md) - Sidebar collapsed (#8), note editing (#9), navigation (#10)
- [spec.md](../spec.md) - FR-008, FR-009, FR-010, FR-012

---

## Subtask T031: Order Notes by Anchor Position

**Purpose**: Ensure notes display in document order (top to bottom).

**Steps**:

1. Notes are already sorted in WP05's reducer:
```swift
state.notes.sort { $0.anchorStart < $1.anchorStart }
```

2. Enhance to handle PDF page numbers:

```swift
state.notes.sort { note1, note2 in
    // First sort by page (if PDF)
    if let page1 = note1.anchorPage, let page2 = note2.anchorPage {
        if page1 != page2 {
            return page1 < page2
        }
    }
    // Then by position within page/document
    return note1.anchorStart < note2.anchorStart
}
```

3. Add visual position indicators in NoteCard:

```swift
// In NoteCard, add position indicator
if let page = note.anchorPage {
    Text("p.\(page + 1)")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .background(.quaternary, in: Capsule())
}
```

**Files**:
- `Features/Notes/NotesFeature.swift` (update sorting)
- `Features/Notes/NoteCard.swift` (add position indicator)

**Validation**:
- [ ] Notes sorted by page then position
- [ ] Position indicator shows for PDFs
- [ ] Order maintained after adding new notes

---

## Subtask T032: Implement Inline Note Editing

**Purpose**: Allow editing note content directly in the sidebar (mockup #9).

**Steps**:

Inline editing is already scaffolded in WP05's NoteCard. Enhance:

1. Add autosave on focus loss:

```swift
// In NoteCard editingView
TextEditor(text: $editText)
    // ...
    .onSubmit {
        onSave(editText)
    }
    .onChange(of: editText) { _, newValue in
        // Debounced autosave could go here
    }
```

2. Handle click-outside to save:

```swift
// In NotesSidebar
.onTapGesture {
    if store.editingNoteId != nil {
        // Trigger save for currently editing note
        if let id = store.editingNoteId,
           let note = store.notes.first(where: { $0.id == id }) {
            // Note: Need to pass the current text somehow
            store.send(.stopEditing)
        }
    }
}
```

3. Improve TextEditor styling:

```swift
TextEditor(text: $editText)
    .font(.body)
    .frame(minHeight: 60, maxHeight: 200)
    .scrollContentBackground(.hidden)
    .padding(8)
    .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
    .overlay(
        RoundedRectangle(cornerRadius: 6)
            .stroke(Color.accentColor, lineWidth: 1)
    )
```

**Files**:
- `Features/Notes/NoteCard.swift` (update editing)
- `Features/Notes/NotesSidebar.swift` (add tap handler)

**Validation**:
- [ ] Double-click enters edit mode
- [ ] Done button saves changes
- [ ] Click outside saves and exits edit mode
- [ ] Escape cancels without saving

---

## Subtask T033: Implement Note Deletion with Confirmation

**Purpose**: Allow deleting notes with confirmation dialog.

**Steps**:

Deletion confirmation is already in NoteCard. Enhance:

1. Add keyboard shortcut for delete while editing:

```swift
.onKeyPress(.delete, modifiers: .command) {
    showDeleteConfirmation = true
    return .handled
}
```

2. Add swipe-to-delete in sidebar:

```swift
// In NotesSidebar, wrap NoteCard
NoteCard(/* ... */)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
        Button(role: .destructive) {
            store.send(.deleteNote(note.id))
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }
```

**Files**:
- `Features/Notes/NoteCard.swift` (add keyboard shortcut)
- `Features/Notes/NotesSidebar.swift` (add swipe action)

**Validation**:
- [ ] Delete button shows confirmation
- [ ] Confirmation dialog matches mockup
- [ ] Swipe-to-delete works
- [ ] ⌘Delete triggers confirmation

---

## Subtask T034: Implement Note-to-Anchor Navigation

**Purpose**: Click note header to scroll document to anchored text (mockup #10).

**Steps**:

1. Add navigation action handling in AppFeature:

```swift
// In AppFeature
case .notes(.navigateToNote(let noteId)):
    guard let note = state.notes.notes.first(where: { $0.id == noteId }) else {
        return .none
    }
    return .send(.document(.scrollToAnchor(
        page: note.anchorPage,
        start: note.anchorStart,
        end: note.anchorEnd
    )))
```

2. Add scroll action to DocumentFeature:

```swift
enum Action {
    // ...
    case scrollToAnchor(page: Int?, start: Int, end: Int)
    case highlightAnchor(start: Int, end: Int)
    case clearHighlight
}

case .scrollToAnchor(let page, let start, let end):
    state.highlightedRange = (start, end)
    // Scroll will be handled by view
    return .run { send in
        // Clear highlight after delay
        try await Task.sleep(for: .seconds(2))
        await send(.clearHighlight)
    }
```

3. Implement scroll in PDFRenderer:

```swift
// Add scrollToSelection method
func scrollToSelection(start: Int, end: Int, page: Int?) {
    guard let pdfDoc = document else { return }

    if let pageNum = page,
       let pdfPage = pdfDoc.page(at: pageNum) {
        // Create selection for highlighting
        if let selection = pdfDoc.findString(/* based on offsets */) {
            pdfView.setCurrentSelection(selection, animate: true)
            pdfView.scrollSelectionToVisible(nil)
        } else {
            pdfView.go(to: pdfPage)
        }
    }
}
```

4. Add visual highlight overlay:

```swift
// In DocumentView
.overlay {
    if let range = store.highlightedRange {
        highlightOverlay(range: range)
    }
}

private func highlightOverlay(range: (Int, Int)) -> some View {
    // Flash effect
    Color.accentColor.opacity(0.3)
        .allowsHitTesting(false)
        .animation(.easeInOut(duration: 0.3).repeatCount(3), value: range.0)
}
```

**Files**:
- `App/AppFeature.swift` (add navigation handling)
- `Features/Document/DocumentFeature.swift` (add scroll action)
- `Renderers/PDFRenderer.swift` (add scroll method)
- `Features/Document/DocumentView.swift` (add highlight)

**Validation**:
- [ ] Click note header scrolls to position
- [ ] Anchored text briefly highlights
- [ ] Works for PDF page navigation
- [ ] Works for text scroll position
- [ ] Smooth animation

---

## Subtask T035: Implement Sidebar Collapse/Expand

**Purpose**: Allow collapsing sidebar to maximize reading space (mockup #8).

**Steps**:

1. Add collapse state to AppFeature:

```swift
@ObservableState
struct State: Equatable {
    // ...
    var isSidebarCollapsed: Bool = false
}

enum Action {
    // ...
    case toggleSidebar
}

case .toggleSidebar:
    state.isSidebarCollapsed.toggle()
    return .none
```

2. Update ContentView NavigationSplitView:

```swift
NavigationSplitView(
    columnVisibility: Binding(
        get: {
            store.isSidebarCollapsed
                ? .detailOnly
                : .all
        },
        set: { visibility in
            store.send(.toggleSidebar)
        }
    )
) {
    NotesSidebar(store: store.scope(state: \.notes, action: \.notes))
} detail: {
    DocumentView(/* ... */)
}
.navigationSplitViewStyle(.balanced)
```

3. Add collapse button to sidebar header:

```swift
// In NotesSidebar header
Button {
    // Parent handles toggle
} label: {
    Image(systemName: "sidebar.left")
}
.buttonStyle(.plain)
```

4. Add keyboard shortcut:

```swift
// In ContentView
.onKeyPress("n", modifiers: [.command, .shift]) {
    store.send(.toggleSidebar)
    return .handled
}
```

5. Show collapsed indicator with note count:

```swift
// When collapsed, show mini indicator
if store.isSidebarCollapsed {
    VStack {
        Button {
            store.send(.toggleSidebar)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: "chevron.right")
                Text("\(store.notes.notes.count)")
                    .font(.caption)
            }
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        Spacer()
    }
    .frame(width: 30)
    .background(.bar)
}
```

**Files**:
- `App/AppFeature.swift` (add collapse state)
- `App/ContentView.swift` (update NavigationSplitView)
- `Features/Notes/NotesSidebar.swift` (add collapse button)

**Validation**:
- [ ] Sidebar collapses smoothly
- [ ] Collapsed view shows note count
- [ ] ⌘⇧N toggles sidebar
- [ ] Click expand button opens sidebar
- [ ] State persists during session

---

## Definition of Done

- [ ] Notes ordered correctly by position
- [ ] Inline editing works with autosave
- [ ] Deletion shows confirmation dialog
- [ ] Click note navigates to anchor
- [ ] Anchor highlights briefly after navigation
- [ ] Sidebar collapses/expands smoothly
- [ ] ⌘⇧N keyboard shortcut works

## Risks

| Risk | Mitigation |
|------|------------|
| PDF scroll accuracy | Use PDFKit selection APIs |
| Animation performance | Use simple opacity animations |

## Reviewer Guidance

1. Test note ordering with multiple notes
2. Verify inline editing saves correctly
3. Test deletion flow with confirmation
4. Test navigation in PDF and text documents
5. Verify sidebar collapse animation is smooth

## Activity Log

- 2026-02-10T18:49:01Z – claude-opus – shell_pid=51736 – lane=doing – Assigned agent via workflow command
- 2026-02-10T18:51:02Z – claude-opus – shell_pid=51736 – lane=planned – Blocked: WP05 (Notes Core) not yet implemented. WP06 depends on WP05 for NotesSidebar, NoteCard, NotesFeature, NotesClient.
