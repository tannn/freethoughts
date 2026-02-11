# FreeThoughts macOS Code Review Findings

**Date:** 2026-02-11
**Reviewers:** Code Reviewer Agent, Swift Expert Agent
**Overall Grade:** A-

Strong TCA foundations, clean feature separation, proper SwiftData/TCA boundary patterns. Architecture is solid with specific areas to tighten up.

---

## Status Legend

- [ ] Not started
- [x] Fixed
- [-] Deferred (with rationale)

---

## Critical

### C1. Silent Error Swallowing in NotesFeature
- **Status:** [x] Fixed
- **Files:** `NotesFeature.swift`
- **Risk:** Data loss — errors from SwiftData ops silently discarded.
- **Fix:** Added `error` state, error actions (`notesLoadFailed`, `noteSaveFailed`, `noteDeleteFailed`, `noteUpdateFailed`, `dismissError`), do/catch blocks on all 5 `.run` effects, optimistic rollback on `updateNoteText` failure, and error alert in `ContentView`.

### C2. PDFDocument (Reference Type) in TCA State
- **Status:** [-] Deferred — significant refactor touching Document loading, DocumentFeature state, PDFRenderer, AppFeature context extraction, and DocumentView. Current custom Equatable works for the app's file-URL-based use case. Planned for a dedicated PR.
- **Files:** `Document.swift` lines 45-59

### C3. Duplicate ModelContainer Instances
- **Status:** [x] Fixed
- **Files:** `FreeThoughtsApp.swift`, `DataContainer.swift`
- **Fix:** Removed separate `DataContainer.create()` call and `modelContainer` property from `FreeThoughtsApp`. Removed `.modelContainer()` modifier from WindowGroup. TCA dependency (`ModelContainerKey.liveValue`) is now the single source of truth.

---

## Major

### M1. Missing Stream Cancellation in FoundationModelsClient
- **Status:** [x] Fixed
- **Files:** `FoundationModelsClient.swift`
- **Fix:** Added `continuation.onTermination = { _ in task.cancel() }` to both `liveValue` and `testValue` stream closures.

### M2. Side Effect in Reducer Body
- **Status:** [x] Fixed
- **Files:** `DocumentFeature.swift`
- **Fix:** Moved `FileManager.default.attributesOfItem` into `.run` effect. Added `loadingFileSizeResult(Int?)` action to receive the result.

### M3. Cross-Feature State Mutation in AppFeature
- **Status:** [x] Fixed
- **Files:** `AppFeature.swift`, `ProvocationFeature.swift`
- **Fix:** Replaced `state.provocation.selectedPromptId = promptId` with `.send(.provocation(.selectPrompt(promptId)))`. Replaced `state.provocation.isAIAvailable = available` with `.send(.provocation(.setAIAvailability(available)))`. Added `setAIAvailability(Bool)` action to `ProvocationFeature`.

### M4. Hardcoded Key Codes Without Documentation
- **Status:** [x] Fixed
- **Files:** `ContentView.swift`
- **Fix:** Added `private enum KeyCode` with named constants (`o`, `n`, `p`, `comma`, `escape`) and inline comments on each `.onKeyPress` call.

### M5. Icon Mapping Duplicated 3x
- **Status:** [x] Fixed
- **Files:** `ProvocationPromptItem.swift`, `NoteCard.swift`, `ProvocationResponseView.swift`, `ProvocationStylePicker.swift`
- **Fix:** Added `var icon: String` computed property and `static func icon(for:)` on `ProvocationPromptItem`. Updated all 3 call sites to use the centralized mapping.

### M6. Missing Sendable Conformance
- **Status:** [x] Fixed
- **Files:** `NoteItem.swift`, `ProvocationItem.swift`, `ProvocationPromptItem.swift`, `Document.swift`
- **Fix:** Added `Sendable` to `NoteItem`, `ProvocationItem`, `ProvocationPromptItem`. Added `@unchecked Sendable` to `Document` (contains `PDFDocument` reference type — full fix deferred with C2).

### M7. DispatchQueue.main.async in Drop Handler
- **Status:** [-] Deferred — uses `NSItemProvider` completion handler context; changing requires careful testing of drag-and-drop behavior. Planned for separate PR.
- **Files:** `ContentView.swift`

---

## Minor

### m1. print() in Production Code
- **Status:** [x] Fixed
- **Files:** `ProvocationFeature.swift`
- **Fix:** Replaced `print()` with `os.Logger`.

### m2. Mixed Dependency Declaration Styles
- **Status:** [x] Fixed
- **Files:** `NotesFeature.swift`
- **Fix:** Changed `@Dependency(NotesClient.self)` to `@Dependency(\.notesClient)`.

### m3. Empty File
- **Status:** [x] Fixed
- **Files:** `ModelContainerDependency.swift`
- **Fix:** Deleted the empty file.

### m4. Stale WP Comments
- **Status:** [x] Fixed
- **Files:** `DocumentFeature.swift`
- **Fix:** Removed `// WP05` and `// WP07/WP08` comments.

### m5. fatalError on DB Initialization
- **Status:** [-] Deferred — UX improvement, separate PR.
- **Files:** `FreeThoughtsApp.swift`, `DataContainer.swift`

### m6. NSAttributedString Recreated Every Render
- **Status:** [-] Deferred
- **Files:** `PlainTextRenderer.swift`

### m7. Markdown Parsed Synchronously in View Init
- **Status:** [-] Deferred
- **Files:** `MarkdownRenderer.swift`

### m8. PDF Selection Always Starts at Offset 0
- **Status:** [-] Deferred
- **Files:** `TextSelection.swift`

### m9. Duplicate Note Sorting Logic
- **Status:** [x] Fixed
- **Files:** `NotesFeature.swift`
- **Fix:** Extracted `sortedByAnchor()` extension on `[NoteItem]`. Used in both `notesLoaded` and `noteSaved` handlers.

### m10. Missing Highlight Cancellation
- **Status:** [x] Fixed
- **Files:** `DocumentFeature.swift`
- **Fix:** Added `CancelID.highlightTimer`, `.cancellable(id:cancelInFlight:)` on the sleep effect, and `.cancel(id:)` on `closeDocument`.

### m11. UserDefaults Magic Strings
- **Status:** [-] Deferred — minimal impact.
- **Files:** `PromptsClient.swift`

### m12. Swift Version Set to 5.0
- **Status:** [-] Deferred — build config change that could break features if done without comprehensive testing.
- **Files:** `project.pbxproj`

---

## Architecture Strengths (No Action Needed)

- Value-type wrappers for SwiftData models (`NoteItem`, `ProvocationItem`, `ProvocationPromptItem`)
- Clean feature modularization — App/Document/Notes/Provocation
- Proper dependency injection via `@DependencyClient` with test values
- Effect cancellation via `CancelID` in `ProvocationFeature`
- Conditional compilation — `#if canImport(FoundationModels)`
- Modern async/await used consistently
