---
work_package_id: WP08
title: AI Provocations UI
lane: "planned"
dependencies: []
base_branch: 001-freethoughts-local-ai-document-reader-WP07
base_commit: c83248952611adef995aa8c42ed91209ca24c231
created_at: '2026-02-11T05:37:38.265706+00:00'
subtasks: [T042, T043, T044, T045, T046, T047]
shell_pid: "27525"
agent: "opencode"
review_status: "has_feedback"
reviewed_by: "Tanner"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP08: AI Provocations UI

## Objective

Implement the complete provocation user interface including style selection, text/note provocations, loading states, and streaming response display.

## Implementation Command

```bash
spec-kitty implement WP08 --base WP07
```

Note: Also requires WP05 for note integration.

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP07 (AI Foundation), WP05 (Notes Core)

Reference documents:
- [mockups.md](../mockups.md) - Provocation picker (#5), loading (#6), response (#7), note AI (#11)
- [spec.md](../spec.md) - FR-014 to FR-017

---

## Subtask T042: Create Provocation Style Picker Sheet

**Purpose**: Implement the modal sheet for selecting provocation style (mockup #5).

**Steps**:

1. Create `Features/Provocation/ProvocationStylePicker.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct ProvocationStylePicker: View {
    @Bindable var store: StoreOf<ProvocationFeature>
    let sourceText: String
    let onCancel: () -> Void
    let onGenerate: () -> Void

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("AI Provocation")
                    .font(.headline)

                Spacer()

                Button {
                    onCancel()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Selected text context
            VStack(alignment: .leading, spacing: 4) {
                Text("Analyzing:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("\"\(sourceText.prefix(200))\(sourceText.count > 200 ? "..." : "")\"")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
            }

            // Style selection
            VStack(alignment: .leading, spacing: 8) {
                Text("Choose a provocation style:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(store.availablePrompts, id: \.id) { prompt in
                        PromptStyleButton(
                            prompt: prompt,
                            isSelected: store.selectedPromptId == prompt.id,
                            action: {
                                store.send(.selectPrompt(prompt.id))
                            }
                        )
                    }
                }
            }

            Divider()

            // Actions
            HStack {
                Spacer()

                Button("Cancel") {
                    onCancel()
                }
                .keyboardShortcut(.escape)

                Button("Generate") {
                    onGenerate()
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(store.selectedPromptId == nil)
            }
        }
        .padding(20)
        .frame(width: 450)
    }
}

struct PromptStyleButton: View {
    let prompt: ProvocationPrompt
    let isSelected: Bool
    let action: () -> Void

    private var icon: String {
        switch prompt.name.lowercased() {
        case "challenge": return "magnifyingglass"
        case "expand": return "globe"
        case "simplify": return "lightbulb"
        case "question": return "questionmark"
        default: return "sparkles"
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)

                Text(prompt.name)
                    .font(.caption)
                    .fontWeight(.medium)

                if isSelected {
                    Text("✓ selected")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 80)
            .background(
                isSelected
                    ? Color.accentColor.opacity(0.15)
                    : Color.secondary.opacity(0.05),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isSelected ? Color.accentColor : Color.clear,
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
```

**Files**:
- `Features/Provocation/ProvocationStylePicker.swift` (~130 lines)

**Validation**:
- [ ] Shows all prompt styles in grid
- [ ] Selection highlights correctly
- [ ] Cancel and Generate work
- [ ] ⌘Enter triggers generate

---

## Subtask T043: Implement Provocation on Text Selection

**Purpose**: Connect text selection popover to provocation flow.

**Steps**:

1. Add provocation sheet state to AppFeature:

```swift
@ObservableState
struct State: Equatable {
    // ...
    var showProvocationPicker: Bool = false
    var provocationSourceText: String = ""
    var provocationContext: String = ""
}
```

2. Handle selection popover action:

```swift
// In DocumentFeature or AppFeature
case .document(.requestProvocationFromSelection):
    guard let selection = state.document.currentSelection else {
        return .none
    }

    state.provocationSourceText = selection.text
    // Get surrounding context
    if let document = state.document.document {
        state.provocationContext = getContext(from: document, around: selection)
    }
    state.showProvocationPicker = true

    // Set up the request
    let request = ProvocationFeature.ProvocationRequest(
        sourceType: .textSelection,
        sourceText: selection.text,
        context: state.provocationContext,
        documentPath: selection.documentPath,
        noteId: nil
    )
    return .send(.provocation(.requestProvocation(request)))
```

3. Add context extraction helper:

```swift
private func getContext(from document: Document, around selection: TextSelection) -> String {
    switch document.content {
    case .text(let fullText):
        // Get ~500 chars around selection
        let start = max(0, selection.range.startOffset - 250)
        let end = min(fullText.count, selection.range.endOffset + 250)
        let startIndex = fullText.index(fullText.startIndex, offsetBy: start)
        let endIndex = fullText.index(fullText.startIndex, offsetBy: end)
        return String(fullText[startIndex..<endIndex])

    case .pdf(let pdfDoc):
        // Get text from current page
        if let page = selection.range.page,
           let pdfPage = pdfDoc.page(at: page) {
            return pdfPage.string ?? ""
        }
        return ""
    }
}
```

4. Show provocation picker sheet:

```swift
// In ContentView
.sheet(isPresented: Binding(
    get: { store.showProvocationPicker },
    set: { if !$0 { store.showProvocationPicker = false } }
)) {
    ProvocationStylePicker(
        store: store.scope(state: \.provocation, action: \.provocation),
        sourceText: store.provocationSourceText,
        onCancel: {
            store.showProvocationPicker = false
            store.send(.provocation(.clearResponse))
        },
        onGenerate: {
            store.showProvocationPicker = false
            store.send(.provocation(.startGeneration))
        }
    )
}
```

**Files**:
- `App/AppFeature.swift` (add state and actions)
- `App/ContentView.swift` (add sheet)

**Validation**:
- [ ] Selection popover triggers picker
- [ ] Context extracted correctly
- [ ] Generate starts AI request

---

## Subtask T044: Implement Provocation on Notes

**Purpose**: Add AI provocation button to note cards (mockup #11).

**Steps**:

1. Update NoteCard to show AI menu:

```swift
// In NoteCard, update the AI button
Menu {
    ForEach(availablePrompts, id: \.id) { prompt in
        Button {
            onSelectPrompt(prompt.id)
        } label: {
            Label(prompt.name, systemImage: iconFor(prompt))
        }
    }
} label: {
    Label("AI", systemImage: "sparkles")
        .font(.caption)
}
.menuStyle(.borderlessButton)
```

2. Pass prompts to NoteCard:

```swift
// In NotesSidebar
NoteCard(
    note: note,
    isEditing: store.editingNoteId == note.id,
    availablePrompts: provocationStore.availablePrompts,
    onTap: { /* ... */ },
    // ...
    onSelectPrompt: { promptId in
        // Trigger provocation on this note
        store.send(.requestNoteProvocation(noteId: note.id, promptId: promptId))
    }
)
```

3. Handle note provocation in AppFeature:

```swift
case .notes(.requestNoteProvocation(let noteId, let promptId)):
    guard let note = state.notes.notes.first(where: { $0.id == noteId }),
          let document = state.document.document else {
        return .none
    }

    let context = note.selectedText + "\n\n" + note.content
    let request = ProvocationFeature.ProvocationRequest(
        sourceType: .note,
        sourceText: note.content,
        context: context,
        documentPath: note.documentPath,
        noteId: noteId
    )

    state.provocation.selectedPromptId = promptId
    return .merge(
        .send(.provocation(.requestProvocation(request))),
        .send(.provocation(.startGeneration))
    )
```

**Files**:
- `Features/Notes/NoteCard.swift` (add AI menu)
- `Features/Notes/NotesSidebar.swift` (pass prompts)
- `App/AppFeature.swift` (handle note provocation)

**Validation**:
- [ ] AI button shows dropdown menu
- [ ] All prompt styles in menu
- [ ] Selection triggers generation
- [ ] Uses note content as source

---

## Subtask T045: Create Loading State UI

**Purpose**: Show loading indicator during AI generation (mockup #6).

**Steps**:

1. Create `Features/Provocation/ProvocationLoadingView.swift`:

```swift
import SwiftUI

struct ProvocationLoadingView: View {
    let promptName: String
    let onCancel: () -> Void

    @State private var progress: Double = 0

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "sparkles")
                Text("Generating...")
                    .fontWeight(.medium)
            }
            .foregroundStyle(.secondary)

            ProgressView(value: progress)
                .progressViewStyle(.linear)
                .frame(width: 150)

            Text("\(promptName) style")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Button("Cancel") {
                onCancel()
            }
            .font(.caption)
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .onAppear {
            // Animate progress
            withAnimation(.linear(duration: 10)) {
                progress = 0.9
            }
        }
    }
}
```

2. Show loading state in sidebar or overlay:

```swift
// In NotesSidebar or ContentView
if store.provocation.isGenerating {
    ProvocationLoadingView(
        promptName: store.provocation.availablePrompts
            .first(where: { $0.id == store.provocation.selectedPromptId })?.name ?? "",
        onCancel: {
            store.send(.provocation(.clearResponse))
        }
    )
}
```

**Files**:
- `Features/Provocation/ProvocationLoadingView.swift` (~50 lines)

**Validation**:
- [ ] Progress bar animates
- [ ] Shows prompt style name
- [ ] Cancel button works
- [ ] Disappears on completion

---

## Subtask T046: Implement Streaming Response Display

**Purpose**: Show AI response as it streams in (mockup #7).

**Steps**:

1. Create `Features/Provocation/ProvocationResponseView.swift`:

```swift
import SwiftUI

struct ProvocationResponseView: View {
    let promptName: String
    let response: String
    let isComplete: Bool

    private var icon: String {
        switch promptName.lowercased() {
        case "challenge": return "magnifyingglass"
        case "expand": return "globe"
        case "simplify": return "lightbulb"
        case "question": return "questionmark"
        default: return "sparkles"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Style indicator
            HStack(spacing: 4) {
                Image(systemName: icon)
                Text(promptName)
                    .fontWeight(.medium)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            // Response text
            Text(response)
                .font(.body)
                .italic()
                .foregroundStyle(.primary)

            // Streaming indicator
            if !isComplete {
                HStack(spacing: 4) {
                    Circle()
                        .fill(.accent)
                        .frame(width: 6, height: 6)
                        .opacity(0.5)
                    Circle()
                        .fill(.accent)
                        .frame(width: 6, height: 6)
                        .opacity(0.7)
                    Circle()
                        .fill(.accent)
                        .frame(width: 6, height: 6)
                }
                .animation(.easeInOut(duration: 0.6).repeatForever(), value: isComplete)
            }
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
    }
}
```

2. Display response in NoteCard when available:

```swift
// In NoteCard, after content
if let provocation = note.provocations.last {
    Divider()
        .padding(.vertical, 4)

    ProvocationResponseView(
        promptName: provocation.promptName,
        response: provocation.response,
        isComplete: true
    )
}

// Or show streaming response
if store.isGenerating && store.pendingRequest?.noteId == note.id {
    Divider()
        .padding(.vertical, 4)

    ProvocationResponseView(
        promptName: selectedPromptName,
        response: store.currentResponse,
        isComplete: false
    )
}
```

**Files**:
- `Features/Provocation/ProvocationResponseView.swift` (~60 lines)
- `Features/Notes/NoteCard.swift` (show response)

**Validation**:
- [ ] Response streams in real-time
- [ ] Streaming indicator shows during generation
- [ ] Style icon and name display
- [ ] Completed response removes indicator

---

## Subtask T047: Persist Provocations to SwiftData

**Purpose**: Save completed provocations and associate with notes.

**Steps**:

1. Add provocation persistence to PromptsClient:

```swift
// In PromptsClient
var saveProvocation: @Sendable (_ provocation: Provocation, _ noteId: UUID?) async throws -> Provocation

// In liveValue
saveProvocation: { provocation, noteId in
    let context = ModelContext(container)

    // Link to note if provided
    if let noteId = noteId {
        let predicate = #Predicate<Note> { $0.id == noteId }
        let descriptor = FetchDescriptor(predicate: predicate)
        if let note = try context.fetch(descriptor).first {
            provocation.note = note
        }
    }

    context.insert(provocation)
    try context.save()
    return provocation
}
```

2. Update ProvocationFeature to persist:

```swift
case .saveProvocation:
    guard let request = state.pendingRequest,
          let promptId = state.selectedPromptId,
          let prompt = state.availablePrompts.first(where: { $0.id == promptId }) else {
        return .none
    }

    let provocation = Provocation(
        documentPath: request.documentPath,
        sourceType: request.sourceType,
        sourceText: request.sourceText,
        promptName: prompt.name,
        response: state.currentResponse
    )

    let noteId = request.noteId

    return .run { send in
        @Dependency(\.promptsClient) var client
        let saved = try await client.saveProvocation(provocation, noteId)
        await send(.provocationSaved(saved))
    }
```

3. Load provocations with notes:

```swift
// In NotesClient.loadNotes, provocations are auto-loaded via relationship
// SwiftData handles this automatically
```

**Files**:
- `Features/Provocation/PromptsClient.swift` (add saveProvocation)
- `Features/Provocation/ProvocationFeature.swift` (update save)

**Validation**:
- [ ] Provocations save to SwiftData
- [ ] Provocations link to notes correctly
- [ ] Provocations reload with notes

---

## Definition of Done

- [ ] Style picker sheet shows all prompts
- [ ] Text selection triggers provocation flow
- [ ] Note AI button shows prompt menu
- [ ] Loading state displays during generation
- [ ] Streaming response updates in real-time
- [ ] Completed provocations persist to SwiftData
- [ ] Provocations display in note cards

## Risks

| Risk | Mitigation |
|------|------------|
| Streaming UI performance | Debounce updates if needed |
| Response too long | Add scroll or truncation |

## Reviewer Guidance

1. Test provocation from text selection
2. Test provocation from note AI button
3. Verify streaming response display
4. Check persistence after app restart
5. Test all four prompt styles

## Activity Log

- 2026-02-10T23:00:49Z – unknown – lane=doing – Automated: start implementation
- 2026-02-11T05:37:38Z – claude-opus – shell_pid=23445 – lane=doing – Assigned agent via workflow command
- 2026-02-11T05:51:10Z – claude-opus – shell_pid=23445 – lane=for_review – Ready for review: provocation picker, loading/streaming UI, note AI menu, and persistence
- 2026-02-11T05:52:20Z – opencode – shell_pid=27525 – lane=doing – Started review via workflow command
- 2026-02-11T05:57:19Z – opencode – shell_pid=27525 – lane=planned – Moved to planned
