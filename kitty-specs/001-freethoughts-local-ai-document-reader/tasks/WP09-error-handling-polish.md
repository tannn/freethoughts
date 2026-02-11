---
work_package_id: WP09
title: Error Handling & Polish
lane: "done"
dependencies: [WP06, WP08]
base_branch: 001-freethoughts-local-ai-document-reader-WP08
base_commit: bfa031453e5b2886edb6eaf0414cf7ddf6d524aa
created_at: '2026-02-11T06:51:14.049218+00:00'
subtasks: [T048, T049, T050, T051, T052, T053]
shell_pid: "53428"
agent: "OpenCode"
review_status: "has_feedback"
reviewed_by: "Tanner"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP09: Error Handling & Polish

## Objective

Handle edge cases and errors gracefully, implement all keyboard shortcuts, and add smooth animations throughout the app.

## Implementation Command

```bash
spec-kitty implement WP09 --base WP08
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP06 (Notes Polish), WP08 (AI Provocations UI)

Reference documents:
- [mockups.md](../mockups.md) - AI unavailable (#12), no selectable text (#13)
- [spec.md](../spec.md) - Edge cases section

---

## Subtask T048: Handle Corrupted/Unreadable Files

**Purpose**: Display user-friendly error when files can't be loaded.

**Steps**:

1. Errors are already captured in DocumentFeature. Add error alert:

```swift
// In ContentView
.alert(
    "Unable to Open Document",
    isPresented: Binding(
        get: { store.document.error != nil },
        set: { if !$0 { store.send(.document(.clearError)) } }
    ),
    presenting: store.document.error
) { error in
    Button("OK") {
        store.send(.document(.clearError))
    }
} message: { error in
    Text(error)
}
```

2. Add more specific error types to DocumentError:

```swift
enum DocumentError: Error, LocalizedError {
    case unsupportedFormat
    case loadFailed
    case fileNotFound
    case accessDenied
    case corrupted

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return "This file format is not supported. Please open a PDF, Markdown (.md), or plain text (.txt) file."
        case .loadFailed:
            return "Failed to load the document. The file may be damaged."
        case .fileNotFound:
            return "The file could not be found. It may have been moved or deleted."
        case .accessDenied:
            return "Permission denied. Please check the file's permissions."
        case .corrupted:
            return "The file appears to be corrupted and cannot be opened."
        }
    }
}
```

3. Improve error detection in DocumentClient:

```swift
loadDocument: { url in
    // Check file exists
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw DocumentError.fileNotFound
    }

    // Check readable
    guard FileManager.default.isReadableFile(atPath: url.path) else {
        throw DocumentError.accessDenied
    }

    // ... rest of loading
}
```

**Files**:
- `App/ContentView.swift` (add alert)
- `Features/Document/DocumentClient.swift` (improve error handling)

**Validation**:
- [ ] Corrupted PDF shows error alert
- [ ] Missing file shows appropriate message
- [ ] Alert dismisses cleanly
- [ ] App doesn't crash on bad files

---

## Subtask T049: Detect and Handle PDFs with No Selectable Text

**Purpose**: Inform users when a PDF is scanned/image-only (mockup #13).

**Steps**:

1. Add text detection to DocumentFeature state:

```swift
@ObservableState
struct State: Equatable {
    // ...
    var hasSelectableText: Bool = true
}
```

2. Check for text in PDFs after loading:

```swift
case .documentLoaded(let document):
    state.document = document
    state.isLoading = false

    // Check for selectable text in PDF
    if case .pdf(let pdfDoc) = document.content {
        state.totalPages = pdfDoc.pageCount
        // Check if any page has text
        state.hasSelectableText = (0..<pdfDoc.pageCount).contains { pageIndex in
            guard let page = pdfDoc.page(at: pageIndex) else { return false }
            return page.string?.isEmpty == false
        }
    } else {
        state.totalPages = 1
        state.hasSelectableText = true
    }
    return .none
```

3. Show warning in sidebar when no text:

```swift
// In NotesSidebar or DocumentView
if !store.document.hasSelectableText {
    VStack(spacing: 8) {
        Image(systemName: "info.circle")
            .font(.title2)
            .foregroundStyle(.orange)

        Text("No selectable text detected")
            .font(.headline)

        Text("This document appears to be a scanned image. Notes cannot be anchored to text.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
    }
    .padding()
    .frame(maxWidth: .infinity)
    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
}
```

**Files**:
- `Features/Document/DocumentFeature.swift` (add detection)
- `Features/Notes/NotesSidebar.swift` (add warning)

**Validation**:
- [ ] Scanned PDFs detected correctly
- [ ] Warning displays in sidebar
- [ ] Regular PDFs work normally
- [ ] Selection attempts don't crash

---

## Subtask T050: Show AI Unavailable Message

**Purpose**: Display clear message when Foundation Models not available (mockup #12).

**Steps**:

1. Create `Features/Provocation/AIUnavailableView.swift`:

```swift
import SwiftUI

struct AIUnavailableView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)

            Text("AI Unavailable")
                .font(.headline)

            VStack(spacing: 4) {
                Text("Apple Foundation Models requires")
                Text("macOS 15 or later on Apple Silicon.")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)

            Divider()
                .padding(.vertical, 8)

            Text("Note-taking still works normally.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding()
        .frame(maxWidth: .infinity)
    }
}
```

2. Show in sidebar when AI not available:

```swift
// In NotesSidebar
if !store.isAIAvailable && store.aiAvailabilityChecked {
    AIUnavailableView()
}
```

3. Hide AI buttons when unavailable:

```swift
// In NoteCard
if isAIAvailable {
    Button {
        onProvocation()
    } label: {
        Label("AI", systemImage: "sparkles")
    }
}

// In SelectionPopover
if isAIAvailable {
    Button {
        onProvocation()
    } label: {
        // ...
    }
}
```

**Files**:
- `Features/Provocation/AIUnavailableView.swift` (~40 lines)
- `Features/Notes/NotesSidebar.swift` (show message)
- `Features/Notes/NoteCard.swift` (hide button)
- `Features/Document/SelectionPopover.swift` (hide button)

**Validation**:
- [ ] Message shows on incompatible systems
- [ ] AI buttons hidden when unavailable
- [ ] Note features still work
- [ ] No crashes when AI unavailable

---

## Subtask T051: Implement All Keyboard Shortcuts

**Purpose**: Add all keyboard shortcuts per mockup table.

**Steps**:

1. Add keyboard modifiers in ContentView:

```swift
var body: some View {
    // ... view content
    .onKeyPress("o", modifiers: .command) {
        store.send(.openFilePicker)
        return .handled
    }
    .onKeyPress("n", modifiers: [.command, .shift]) {
        store.send(.toggleSidebar)
        return .handled
    }
    .onKeyPress("n", modifiers: .command) {
        if store.document.currentSelection != nil {
            store.send(.document(.addNoteFromSelection))
            return .handled
        }
        return .ignored
    }
    .onKeyPress("p", modifiers: [.command, .shift]) {
        if store.document.currentSelection != nil {
            store.send(.document(.requestProvocationFromSelection))
            return .handled
        }
        return .ignored
    }
    .onKeyPress(",", modifiers: .command) {
        store.send(.openSettings)
        return .handled
    }
    .onKeyPress(.escape) {
        // Dismiss any open sheets/popovers
        if store.showProvocationPicker {
            store.showProvocationPicker = false
            return .handled
        }
        if store.notes.isCreatingNote {
            store.send(.notes(.cancelNoteCreation))
            return .handled
        }
        return .ignored
    }
}
```

2. Add ⌘Enter for saving in sheets:

```swift
// Already added via .keyboardShortcut(.return, modifiers: .command)
```

3. Create settings placeholder (for ⌘,):

```swift
// In AppFeature
case .openSettings:
    state.showSettings = true
    return .none

// Settings can be a simple view for now
.sheet(isPresented: $store.showSettings) {
    VStack {
        Text("Settings")
            .font(.headline)
        Text("Coming soon...")
            .foregroundStyle(.secondary)
        Button("Close") {
            store.showSettings = false
        }
    }
    .frame(width: 300, height: 200)
}
```

**Files**:
- `App/ContentView.swift` (add key handlers)
- `App/AppFeature.swift` (add settings action)

**Validation**:
- [ ] ⌘O opens file picker
- [ ] ⌘⇧N toggles sidebar
- [ ] ⌘N creates note (with selection)
- [ ] ⌘⇧P triggers provocation (with selection)
- [ ] ⌘Enter saves in sheets
- [ ] Escape dismisses modals
- [ ] ⌘, opens settings

---

## Subtask T052: Add Smooth Animations

**Purpose**: Polish the app with smooth, 60fps animations.

**Steps**:

1. Sidebar collapse animation:

```swift
NavigationSplitView(
    columnVisibility: Binding(/* ... */)
) {
    // sidebar
} detail: {
    // detail
}
.animation(.easeOut(duration: 0.2), value: store.isSidebarCollapsed)
```

2. Scroll-to-anchor animation:

```swift
// In DocumentView or PDFRenderer
withAnimation(.easeInOut(duration: 0.3)) {
    scrollToPosition(anchor.start)
}
```

3. Note appear animation:

```swift
// In NotesSidebar
ForEach(store.notes, id: \.id) { note in
    NoteCard(/* ... */)
        .transition(.opacity.combined(with: .move(edge: .trailing)))
}
.animation(.easeOut(duration: 0.15), value: store.notes.count)
```

4. Highlight flash animation:

```swift
// When navigating to anchor
Rectangle()
    .fill(Color.accentColor)
    .opacity(highlightOpacity)
    .onAppear {
        withAnimation(.easeInOut(duration: 0.3).repeatCount(3, autoreverses: true)) {
            highlightOpacity = 0.3
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation {
                highlightOpacity = 0
            }
        }
    }
```

5. Streaming text animation:

```swift
// Response text can use implicit animation
Text(response)
    .animation(.easeIn(duration: 0.05), value: response)
```

**Files**:
- `App/ContentView.swift` (sidebar animation)
- `Features/Document/DocumentView.swift` (scroll animation)
- `Features/Notes/NotesSidebar.swift` (note animation)

**Validation**:
- [ ] Sidebar animates smoothly
- [ ] Scroll-to-anchor is smooth
- [ ] Notes appear/disappear with animation
- [ ] Anchor highlight flashes nicely
- [ ] All animations at 60fps

---

## Subtask T053: Handle Large Documents Gracefully

**Purpose**: Prevent UI freezes when opening very large documents.

**Steps**:

1. Add file size check:

```swift
// In DocumentClient
loadDocument: { url in
    // Check file size
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    let fileSize = attributes[.size] as? Int ?? 0
    let maxSize = 100 * 1024 * 1024 // 100 MB

    if fileSize > maxSize {
        throw DocumentError.fileTooLarge
    }

    // ... rest of loading
}
```

2. Add loading progress for large files:

```swift
// Show more detailed progress
if store.isLoading {
    VStack {
        ProgressView()
            .scaleEffect(1.5)
        Text("Loading document...")
        if let size = store.loadingFileSize {
            Text("\(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}
```

3. Load content on background thread:

```swift
// DocumentClient already uses async, but ensure heavy work is off main:
loadDocument: { url in
    // File I/O is fine
    let type = Document.DocumentType.from(url: url)!

    let content: Document.DocumentContent = try await Task.detached {
        switch type {
        case .pdf:
            guard let pdfDoc = PDFDocument(url: url) else {
                throw DocumentError.loadFailed
            }
            return .pdf(pdfDoc)

        case .markdown, .plainText:
            let text = try String(contentsOf: url, encoding: .utf8)
            return .text(text)
        }
    }.value

    return Document(/* ... */)
}
```

4. Add file size error:

```swift
enum DocumentError: Error, LocalizedError {
    // ...
    case fileTooLarge

    var errorDescription: String? {
        switch self {
        // ...
        case .fileTooLarge:
            return "This file is too large to open. Maximum file size is 100 MB."
        }
    }
}
```

**Files**:
- `Features/Document/DocumentClient.swift` (add size check)
- `Features/Document/DocumentView.swift` (improve loading UI)

**Validation**:
- [ ] Large files show loading progress
- [ ] Very large files rejected with message
- [ ] UI stays responsive during load
- [ ] No memory issues with big files

---

## Definition of Done

- [ ] Corrupted files show user-friendly error
- [ ] Scanned PDFs detected and warned
- [ ] AI unavailable message displays correctly
- [ ] All keyboard shortcuts work
- [ ] Animations are smooth at 60fps
- [ ] Large documents handled gracefully
- [ ] No crashes on edge cases

## Risks

| Risk | Mitigation |
|------|------------|
| Animation jank | Profile with Instruments |
| Memory with large PDFs | Consider lazy page loading |

## Reviewer Guidance

1. Test with various problematic files
2. Verify all keyboard shortcuts
3. Check animations on older hardware
4. Test with 50+ MB files
5. Ensure no crashes on any edge case

## Activity Log

- 2026-02-10T23:00:49Z – unknown – lane=doing – Automated: start implementation
- 2026-02-11T06:51:14Z – opencode – shell_pid=38746 – lane=doing – Assigned agent via workflow command
- 2026-02-11T07:31:17Z – opencode – shell_pid=38746 – lane=for_review – Ready for review: error handling, AI unavailable state, scanned PDF warnings, keyboard shortcuts, animations, and large document loading polish.
- 2026-02-11T07:34:14Z – OpenCode – shell_pid=53428 – lane=doing – Started review via workflow command
- 2026-02-11T07:43:40Z – OpenCode – shell_pid=53428 – lane=planned – Moved to planned
- 2026-02-11T07:47:38Z – opencode – shell_pid=38746 – lane=doing – Started implementation via workflow command
- 2026-02-11T07:52:33Z – opencode – shell_pid=38746 – lane=for_review – Ready for review: keypress handling now returns handled/ignored and duplicate import removed; build passes.
- 2026-02-11T07:53:50Z – OpenCode – shell_pid=53428 – lane=doing – Started review via workflow command
- 2026-02-11T07:54:08Z – OpenCode – shell_pid=53428 – lane=done – Review passed: error handling polish, AI unavailable UI, keypress handling, animations, large file handling
