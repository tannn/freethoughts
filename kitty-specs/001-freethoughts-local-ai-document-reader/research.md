# Research: FreeThoughts - Local AI Document Reader

**Date**: 2026-02-09
**Status**: Complete

## Technology Decisions

### 1. UI Framework: SwiftUI

**Decision**: SwiftUI as the primary UI framework

**Rationale**:
- Modern, declarative syntax aligns with Swift best practices
- Native macOS integration with system features
- Strong support for accessibility
- Composable views work well with TCA architecture

**Alternatives Considered**:
- AppKit: More control but verbose, less modern
- SwiftUI + AppKit hybrid: Considered for PDF but PDFKit integrates via NSViewRepresentable

### 2. Architecture: MVVM [Model (data), View (UI), and ViewModel (presentation logic)]

**Decision**: Use MVVM design pattern to separate concerns during development

**Rationale**:
- Excellent testability - reducers are pure functions
- Clear separation between state, actions, and effects
- Built-in dependency injection for mocking
- Composable features scale well
- Active community and maintenance (Point-Free)

**Alternatives Considered**:
- TCA: Complex and less common
- Simple @Observable: Too lightweight for app complexity
- Redux-like custom: Reinventing TCA

**Version**: swift-composable-architecture 1.15+

### 3. Persistence: SwiftData

**Decision**: SwiftData for local note storage

**Rationale**:
- Native Swift integration, no bridging
- Works seamlessly with SwiftUI
- Simpler than Core Data for new projects
- Automatic CloudKit sync available (future stretch goal)
- macOS 14+ is fine since we target macOS 15+

**Alternatives Considered**:
- Core Data: More mature but complex setup
- SQLite (GRDB/SQLite.swift): Lower level, more control but more code
- File-based JSON: Simple but no querying, manual relationship handling

### 4. PDF Rendering: PDFKit

**Decision**: Use system PDFKit framework

**Rationale**:
- Native macOS framework, no dependencies
- Built-in text selection (PDFSelection)
- Proven, stable, performant
- Handles rendering, zooming, scrolling

**Alternatives Considered**:
- PSPDFKit: Commercial, overkill for reading
- Custom rendering (Core Graphics): Massive effort, no benefit

### 5. Markdown Rendering: AttributedString

**Decision**: Swift's native AttributedString for markdown rendering

**Rationale**:
- Built into Foundation (macOS 12+)
- Supports CommonMark via `init(markdown:)`
- Renders in SwiftUI Text views
- No external dependencies

**Alternatives Considered**:
- swift-markdown (Apple): More control but overkill
- cmark: C library, bridging overhead
- Down: Third-party, unnecessary dependency

### 6. AI: Apple Foundation Models

**Decision**: Use Apple's on-device Foundation Models framework

**Rationale**:
- Fully local processing - meets privacy requirements
- No API keys or network calls
- Apple-optimized for Apple Silicon
- Available on macOS 15+

**API Notes**:
- Import `FoundationModels` framework
- Check availability with `FoundationModels.isSupported`
- Use `LanguageModel` for text generation
- Support streaming responses for UX

**Alternatives Considered**:
- Ollama/llama.cpp: More models but external runtime
- Cloud APIs (Claude, OpenAI): Violates local-only requirement

## Integration Patterns

### TCA + SwiftData

SwiftData operations wrapped in TCA `Effect`:
```swift
@Dependency(\.persistenceClient) var persistence

case .saveNote(let note):
    return .run { _ in
        try await persistence.save(note)
    }
```

### TCA + PDFKit

PDFView wrapped in `NSViewRepresentable`, selection state synced to TCA:
```swift
struct PDFViewRepresentable: NSViewRepresentable {
    let document: PDFDocument
    @Binding var selection: PDFSelection?
}
```

### TCA + Foundation Models

AI client as TCA dependency with async streaming:
```swift
@Dependency(\.foundationModelsClient) var ai

case .requestProvocation(let context):
    return .run { send in
        for try await chunk in ai.generate(prompt: context) {
            await send(.provocationChunkReceived(chunk))
        }
    }
```

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| How to handle PDF text selection? | Use PDFKit's native PDFSelection API |
| How to anchor notes to positions? | Store character offset + page number |
| How to persist notes? | SwiftData with document path as key |
| How to handle markdown selection? | SwiftUI's text selection (macOS 13+) |
| What if Foundation Models unavailable? | Graceful degradation, disable AI features |

## References

- [TCA Documentation](https://pointfreeco.github.io/swift-composable-architecture/)
- [SwiftData Documentation](https://developer.apple.com/documentation/swiftdata)
- [PDFKit Documentation](https://developer.apple.com/documentation/pdfkit)
- [Foundation Models WWDC](https://developer.apple.com/videos/) (WWDC 2024/2025)
