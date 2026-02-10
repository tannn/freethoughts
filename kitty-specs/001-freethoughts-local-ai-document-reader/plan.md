# Implementation Plan: FreeThoughts - Local AI Document Reader

**Branch**: `001-freethoughts-local-ai-document-reader` | **Date**: 2026-02-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/kitty-specs/001-freethoughts-local-ai-document-reader/spec.md`

## Summary

Build a native macOS document reader application with text annotation and AI-powered provocations. The app supports PDF, markdown, and plain text files with a collapsible notes sidebar. AI features use Apple Foundation Models for fully local, private processing. Architecture follows TCA (The Composable Architecture) with SwiftUI for the interface and SwiftData for persistence.

## Technical Context

**Language/Version**: Swift 5.9+
**Primary Dependencies**: SwiftUI, TCA (ComposableArchitecture), PDFKit, SwiftData, Foundation Models
**Storage**: SwiftData (local, on-device)
**Testing**: XCTest (unit, integration, UI)
**Target Platform**: macOS 15+ (Sequoia)
**Project Type**: Single native macOS application
**Performance Goals**: 60fps UI, <3s document open, <10s AI response
**Constraints**: Fully offline-capable, no network calls, all data local
**Scale/Scope**: Personal use, single-user, local documents

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Swift with SwiftUI | ✅ PASS | Using Swift 5.9+ and SwiftUI |
| Apple Swift API Design Guidelines | ✅ PASS | Will follow standard naming conventions |
| Modern Swift concurrency | ✅ PASS | async/await for AI and file operations |
| XCTest for all testing | ✅ PASS | Unit, integration, UI tests planned |
| 60fps smooth UI | ✅ PASS | Performance goal documented |
| macOS only | ✅ PASS | macOS 15+ target |
| Direct distribution | ✅ PASS | Not App Store |
| No external runtime dependencies | ✅ PASS | All dependencies compiled in |

**Constitution Status**: All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```
kitty-specs/001-freethoughts-local-ai-document-reader/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API)
├── checklists/          # Quality validation
│   └── requirements.md
└── tasks.md             # Phase 2 output (created by /spec-kitty.tasks)
```

### Source Code (repository root)

```
macos-native/
├── FreeThoughts.xcodeproj/     # Xcode project
├── FreeThoughts/
│   ├── App/
│   │   ├── FreeThoughtsApp.swift      # App entry point
│   │   └── AppFeature.swift           # Root TCA feature
│   ├── Features/
│   │   ├── Document/
│   │   │   ├── DocumentFeature.swift  # TCA reducer
│   │   │   ├── DocumentView.swift     # SwiftUI view
│   │   │   └── DocumentClient.swift   # File loading dependency
│   │   ├── Notes/
│   │   │   ├── NotesFeature.swift     # TCA reducer
│   │   │   ├── NotesSidebar.swift     # Sidebar view
│   │   │   └── NoteEditor.swift       # Note editing view
│   │   └── Provocation/
│   │       ├── ProvocationFeature.swift  # TCA reducer
│   │       ├── ProvocationView.swift     # AI response display
│   │       └── FoundationModelsClient.swift  # AI dependency
│   ├── Models/
│   │   ├── Document.swift             # Document model
│   │   ├── Note.swift                 # Note model (SwiftData)
│   │   ├── Provocation.swift          # Provocation model
│   │   └── ProvocationPrompt.swift    # Prompt templates
│   ├── Renderers/
│   │   ├── PDFRenderer.swift          # PDFKit integration
│   │   ├── MarkdownRenderer.swift     # Markdown to AttributedString
│   │   └── PlainTextRenderer.swift    # Plain text display
│   ├── Persistence/
│   │   └── DataContainer.swift        # SwiftData container setup
│   └── Resources/
│       ├── Assets.xcassets/
│       └── DefaultPrompts.json        # Pre-configured prompts
└── FreeThoughtsTests/
    ├── Unit/
    │   ├── DocumentFeatureTests.swift
    │   ├── NotesFeatureTests.swift
    │   └── ProvocationFeatureTests.swift
    ├── Integration/
    │   ├── PersistenceTests.swift
    │   └── RendererTests.swift
    └── UI/
        └── AppFlowTests.swift
```

**Structure Decision**: Single macOS app in `macos-native/` directory with TCA feature-based organization. Each major feature (Document, Notes, Provocation) has its own TCA reducer, view, and dependencies. Models are shared. Renderers handle format-specific display logic.

## Key Architecture Decisions

### 1. TCA Feature Composition

```
AppFeature
├── DocumentFeature (handles file loading, rendering, text selection)
├── NotesFeature (handles note CRUD, sidebar, persistence)
└── ProvocationFeature (handles AI requests, prompt selection)
```

Features communicate via shared state and actions. Document selections trigger note creation options. Notes and selections can trigger provocation requests.

### 2. Document Rendering Strategy

| Format | Renderer | Text Selection |
|--------|----------|----------------|
| PDF | PDFKit (PDFView) | Native PDFSelection |
| Markdown | AttributedString + Text | Custom selection handling |
| Plain Text | Text view | Native SwiftUI selection |

PDFKit provides built-in text selection. For markdown/text, use SwiftUI's text selection APIs (macOS 13+).

### 3. SwiftData Schema

- `Note` entity with document reference, anchor positions, content, timestamps
- Anchor stored as start/end character offsets plus page number (for PDF)
- Notes query filtered by current document

### 4. Apple Foundation Models Integration

- Use `FoundationModels` framework (macOS 15+)
- Wrap in TCA dependency (`FoundationModelsClient`)
- Handle model availability checks gracefully
- Stream responses for better UX

## Complexity Tracking

*No constitution violations. Table not applicable.*

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| swift-composable-architecture | 1.15+ | TCA state management |
| PDFKit | System | PDF rendering |
| SwiftData | System | Local persistence |
| FoundationModels | System | On-device AI |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Apple Foundation Models API changes | Medium | High | Abstract behind TCA client, mock for tests |
| PDF text selection complexity | Medium | Medium | Use PDFKit native selection, document limitations |
| Large document performance | Low | Medium | Lazy loading, background processing |
| SwiftData migration issues | Low | Medium | Simple schema, version from start |

## Next Steps

After `/spec-kitty.tasks`:
1. WP01: Project setup and app shell
2. WP02: Document rendering (PDF, markdown, text)
3. WP03: Text selection and notes system
4. WP04: AI provocations with Foundation Models
5. WP05: Polish, testing, and documentation
