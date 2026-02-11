---
work_package_id: WP03
title: File Opening & Navigation
lane: "done"
dependencies: [WP02]
base_branch: main
base_commit: aa6d1ea390d911eb2563581cf63ff8f547f70c34
created_at: '2026-02-10T10:35:34.092423+00:00'
subtasks: [T015, T016, T017, T018, T019]
shell_pid: "32221"
agent: "github-copilot"
review_status: "has_feedback"
assignee: opencode
reviewed_by: "Tanner"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP03: File Opening & Navigation

## Objective

Implement all file opening methods (menu, keyboard, drag-drop) and document navigation UI including the status bar.

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP02 (Document Rendering)

Reference documents:
- [mockups.md](../mockups.md) - Empty state (#2), main layout (#1)
- [spec.md](../spec.md) - FR-004 (file opening methods)

---

## Subtask T015: Implement File > Open Menu

**Purpose**: Add File menu with Open command that triggers file picker.

**Steps**:

1. Update `App/FreeThoughtsApp.swift` to add commands:

```swift
var body: some Scene {
    WindowGroup {
        ContentView(store: store)
    }
    .modelContainer(modelContainer)
    .commands {
        CommandGroup(replacing: .newItem) {
            Button("Open...") {
                store.send(.openFilePicker)
            }
            .keyboardShortcut("o", modifiers: .command)
        }
    }
}
```

2. Add action to AppFeature:

```swift
enum Action {
    // ... existing
    case openFilePicker
    case fileSelected(URL)
}

// In reducer body:
case .openFilePicker:
    return .run { send in
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pdf, .plainText]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false

        // Add markdown type
        if let mdType = UTType(filenameExtension: "md") {
            panel.allowedContentTypes.append(mdType)
        }

        let response = await panel.begin()
        if response == .OK, let url = panel.url {
            await send(.fileSelected(url))
        }
    }

case .fileSelected(let url):
    return .send(.document(.openDocument(url)))
```

**Files**:
- `App/FreeThoughtsApp.swift` (update commands)
- `App/AppFeature.swift` (add actions)

**Validation**:
- [ ] File > Open appears in menu bar
- [ ] File picker shows on menu click
- [ ] Selected file loads correctly

---

## Subtask T016: Implement ⌘O Keyboard Shortcut

**Purpose**: Ensure keyboard shortcut works for opening files.

**Steps**:

The keyboard shortcut is already added in T015 via `.keyboardShortcut("o", modifiers: .command)`.

Verify:
1. Press ⌘O anywhere in the app
2. File picker should appear
3. Works even when focus is in document view

**Validation**:
- [ ] ⌘O opens file picker
- [ ] Shortcut works from any focus state

---

## Subtask T017: Implement Drag-and-Drop

**Purpose**: Allow dropping files onto the window to open them.

**Steps**:

1. Update `App/ContentView.swift`:

```swift
struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var isDropTargeted = false

    var body: some View {
        NavigationSplitView {
            // ... sidebar
        } detail: {
            // ... document view
        }
        .frame(minWidth: 800, minHeight: 600)
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers)
        }
        .overlay {
            if isDropTargeted {
                dropOverlay
            }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }

        _ = provider.loadObject(ofClass: URL.self) { url, error in
            guard let url = url, error == nil else { return }

            // Check if supported type
            if Document.DocumentType.from(url: url) != nil {
                DispatchQueue.main.async {
                    store.send(.fileSelected(url))
                }
            }
        }
        return true
    }

    private var dropOverlay: some View {
        ZStack {
            Color.accentColor.opacity(0.1)
            VStack {
                Image(systemName: "arrow.down.doc")
                    .font(.system(size: 48))
                Text("Drop to Open")
                    .font(.title2)
            }
            .foregroundStyle(.accent)
        }
        .ignoresSafeArea()
    }
}
```

**Files**:
- `App/ContentView.swift` (add drop handling)

**Validation**:
- [ ] Dragging file over window shows overlay
- [ ] Dropping supported file opens it
- [ ] Unsupported files are ignored
- [ ] Overlay disappears when drag ends

---

## Subtask T018: Create Empty State View

**Purpose**: Show welcoming empty state when no document is open (mockup #2).

**Steps**:

1. The empty state is already in DocumentView from WP02, but enhance it:

```swift
private var emptyView: some View {
    VStack(spacing: 20) {
        HStack(spacing: 16) {
            Image(systemName: "doc.fill")
            Image(systemName: "text.alignleft")
            Image(systemName: "doc.plaintext")
        }
        .font(.system(size: 32))
        .foregroundStyle(.tertiary)

        VStack(spacing: 8) {
            Text("Open a Document")
                .font(.title2)
                .fontWeight(.medium)

            Text("Drop a file here or use File → Open")
                .foregroundStyle(.secondary)
        }

        Text("Supports: PDF, Markdown, Plain Text")
            .font(.caption)
            .foregroundStyle(.tertiary)
            .padding(.top, 8)
    }
    .padding(40)
}
```

**Files**:
- `Features/Document/DocumentView.swift` (update emptyView)

**Validation**:
- [ ] Empty state shows when no document open
- [ ] Icons represent supported formats
- [ ] Text matches mockup exactly

---

## Subtask T019: Create Status Bar

**Purpose**: Add status bar with page info, zoom control, and document type.

**Steps**:

1. Create `Features/Document/StatusBar.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct StatusBar: View {
    let store: StoreOf<DocumentFeature>

    var body: some View {
        HStack {
            // Page info (PDF only)
            if let document = store.document,
               case .pdf = document.content {
                Text("Page \(store.currentPage) of \(store.totalPages)")
                    .monospacedDigit()

                Divider()
                    .frame(height: 12)
            }

            Spacer()

            // Zoom control
            HStack(spacing: 8) {
                Button {
                    store.send(.setZoom(store.zoomLevel - 0.25))
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(store.zoomLevel <= 0.25)

                Text("\(Int(store.zoomLevel * 100))%")
                    .monospacedDigit()
                    .frame(width: 45)

                Button {
                    store.send(.setZoom(store.zoomLevel + 0.25))
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(store.zoomLevel >= 4.0)
            }

            Divider()
                .frame(height: 12)

            // Document type indicator
            if let document = store.document {
                HStack(spacing: 4) {
                    Image(systemName: documentIcon(for: document.type))
                    Text(document.type.displayName)
                }
                .foregroundStyle(.secondary)
            } else {
                Text("Ready")
                    .foregroundStyle(.tertiary)
            }
        }
        .font(.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private func documentIcon(for type: Document.DocumentType) -> String {
        switch type {
        case .pdf: return "doc.fill"
        case .markdown: return "text.alignleft"
        case .plainText: return "doc.plaintext"
        }
    }
}
```

2. Add to ContentView layout:

```swift
var body: some View {
    VStack(spacing: 0) {
        NavigationSplitView {
            // sidebar
        } detail: {
            DocumentView(store: store.scope(state: \.document, action: \.document))
        }

        Divider()

        StatusBar(store: store.scope(state: \.document, action: \.document))
    }
    // ... rest
}
```

**Files**:
- `Features/Document/StatusBar.swift` (~80 lines)
- `App/ContentView.swift` (add StatusBar)

**Validation**:
- [ ] Page info shows for PDFs only
- [ ] Zoom controls work correctly
- [ ] Document type displays with icon
- [ ] "Ready" shows when no document

---

## Definition of Done

- [ ] File > Open menu command works
- [ ] ⌘O keyboard shortcut opens file picker
- [ ] Drag-and-drop opens supported files
- [ ] Empty state displays correctly
- [ ] Status bar shows accurate document info
- [ ] Zoom controls function properly

## Risks

| Risk | Mitigation |
|------|------------|
| NSOpenPanel threading issues | Use MainActor for UI updates |
| Drop types not recognized | Test with various file sources |

## Reviewer Guidance

1. Test all three file opening methods
2. Verify keyboard shortcut works from all focus states
3. Test drag-drop with files from Finder, Desktop, etc.
4. Check status bar updates correctly when switching documents

## Activity Log

- 2026-02-10T10:35:34Z – claude-opus – shell_pid=23884 – lane=doing – Assigned agent via workflow command
- 2026-02-10T10:38:59Z – claude-opus – shell_pid=23884 – lane=for_review – Ready for review: File > Open with Cmd+O, drag-drop with overlay, status bar with page/zoom/type, enhanced empty state. Build succeeds cleanly.
- 2026-02-10T10:43:27Z – github-copilot – shell_pid=27848 – lane=doing – Started review via workflow command
- 2026-02-10T10:46:04Z – github-copilot – shell_pid=27848 – lane=planned – Moved to planned
- 2026-02-10T10:47:57Z – claude-opus – shell_pid=31263 – lane=doing – Started implementation via workflow command
- 2026-02-10T10:52:17Z – claude-opus – shell_pid=31263 – lane=for_review – Fixed review feedback: (1) wired zoom controls to PDFRenderer via zoomLevel/scaleFactor, (2) updated dependencies to [WP02]. Build succeeds.
- 2026-02-10T10:52:47Z – github-copilot – shell_pid=32221 – lane=doing – Started review via workflow command
- 2026-02-10T10:53:33Z – github-copilot – shell_pid=32221 – lane=done – Review passed: zoom wiring + dependency metadata fixed
