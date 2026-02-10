---
work_package_id: WP02
title: Document Rendering
lane: planned
dependencies: []
subtasks: [T008, T009, T010, T011, T012, T013, T014]
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP02: Document Rendering

## Objective

Implement document models and all three format renderers (PDF, Markdown, Plain Text) with a unified view that switches between them based on document type.

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Tech Stack**: Swift 5.9+, SwiftUI, PDFKit, AttributedString
**Dependencies**: WP01 (Project Foundation)

Reference documents:
- [plan.md](../plan.md) - Rendering strategy table
- [research.md](../research.md) - Technology decisions
- [mockups.md](../mockups.md) - Main window layout (#1)

---

## Subtask T008: Create Document Model

**Purpose**: Create the transient Document struct that represents an open document.

**Steps**:

1. Create `Models/Document.swift`:

```swift
import Foundation
import PDFKit

struct Document: Identifiable, Equatable {
    let id: UUID
    let url: URL
    let type: DocumentType
    let content: DocumentContent

    var fileName: String {
        url.lastPathComponent
    }

    var canonicalPath: String {
        url.standardizedFileURL.path
    }

    enum DocumentType: String, CaseIterable {
        case pdf
        case markdown
        case plainText

        var displayName: String {
            switch self {
            case .pdf: return "PDF"
            case .markdown: return "Markdown"
            case .plainText: return "Plain Text"
            }
        }

        static func from(url: URL) -> DocumentType? {
            switch url.pathExtension.lowercased() {
            case "pdf":
                return .pdf
            case "md", "markdown":
                return .markdown
            case "txt", "text":
                return .plainText
            default:
                return nil
            }
        }
    }

    enum DocumentContent: Equatable {
        case pdf(PDFDocument)
        case text(String)

        static func == (lhs: DocumentContent, rhs: DocumentContent) -> Bool {
            switch (lhs, rhs) {
            case (.pdf(let a), .pdf(let b)):
                return a.documentURL == b.documentURL
            case (.text(let a), .text(let b)):
                return a == b
            default:
                return false
            }
        }
    }
}
```

**Files**:
- `Models/Document.swift` (~60 lines)

**Validation**:
- [ ] Document type correctly detected from file extension
- [ ] Canonical path works for document identification

---

## Subtask T009: Create DocumentClient Dependency

**Purpose**: Create TCA dependency for file loading operations.

**Steps**:

1. Create `Features/Document/DocumentClient.swift`:

```swift
import ComposableArchitecture
import Foundation
import PDFKit

@DependencyClient
struct DocumentClient {
    var loadDocument: @Sendable (_ url: URL) async throws -> Document
    var getTextContent: @Sendable (_ document: Document) async -> String?
}

extension DocumentClient: DependencyKey {
    static let liveValue = DocumentClient(
        loadDocument: { url in
            guard let type = Document.DocumentType.from(url: url) else {
                throw DocumentError.unsupportedFormat
            }

            let content: Document.DocumentContent
            switch type {
            case .pdf:
                guard let pdfDoc = PDFDocument(url: url) else {
                    throw DocumentError.loadFailed
                }
                content = .pdf(pdfDoc)

            case .markdown, .plainText:
                let text = try String(contentsOf: url, encoding: .utf8)
                content = .text(text)
            }

            return Document(
                id: UUID(),
                url: url,
                type: type,
                content: content
            )
        },
        getTextContent: { document in
            switch document.content {
            case .pdf(let pdfDoc):
                return pdfDoc.string
            case .text(let text):
                return text
            }
        }
    )

    static let testValue = DocumentClient(
        loadDocument: { _ in
            Document(
                id: UUID(),
                url: URL(fileURLWithPath: "/test.txt"),
                type: .plainText,
                content: .text("Test content")
            )
        },
        getTextContent: { _ in "Test content" }
    )
}

enum DocumentError: Error, LocalizedError {
    case unsupportedFormat
    case loadFailed
    case fileNotFound

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return "This file format is not supported."
        case .loadFailed:
            return "Failed to load the document."
        case .fileNotFound:
            return "The file could not be found."
        }
    }
}

extension DependencyValues {
    var documentClient: DocumentClient {
        get { self[DocumentClient.self] }
        set { self[DocumentClient.self] = newValue }
    }
}
```

**Files**:
- `Features/Document/DocumentClient.swift` (~80 lines)

**Validation**:
- [ ] PDF files load correctly
- [ ] Markdown files load as text
- [ ] Plain text files load correctly
- [ ] Unsupported formats throw appropriate error

---

## Subtask T010: Create DocumentFeature Reducer

**Purpose**: Update DocumentFeature with full state management for document loading and display.

**Steps**:

1. Update `Features/Document/DocumentFeature.swift`:

```swift
import ComposableArchitecture
import Foundation

@Reducer
struct DocumentFeature {
    @ObservableState
    struct State: Equatable {
        var document: Document?
        var isLoading: Bool = false
        var error: String?
        var currentPage: Int = 1
        var totalPages: Int = 1
        var zoomLevel: Double = 1.0
    }

    enum Action {
        case openDocument(URL)
        case documentLoaded(Document)
        case documentLoadFailed(String)
        case closeDocument
        case setPage(Int)
        case setZoom(Double)
        case clearError
    }

    @Dependency(\.documentClient) var documentClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .openDocument(let url):
                state.isLoading = true
                state.error = nil
                return .run { send in
                    do {
                        let document = try await documentClient.loadDocument(url)
                        await send(.documentLoaded(document))
                    } catch {
                        await send(.documentLoadFailed(error.localizedDescription))
                    }
                }

            case .documentLoaded(let document):
                state.document = document
                state.isLoading = false
                state.currentPage = 1
                // Set total pages for PDF
                if case .pdf(let pdfDoc) = document.content {
                    state.totalPages = pdfDoc.pageCount
                } else {
                    state.totalPages = 1
                }
                return .none

            case .documentLoadFailed(let error):
                state.isLoading = false
                state.error = error
                return .none

            case .closeDocument:
                state.document = nil
                state.currentPage = 1
                state.totalPages = 1
                return .none

            case .setPage(let page):
                state.currentPage = max(1, min(page, state.totalPages))
                return .none

            case .setZoom(let zoom):
                state.zoomLevel = max(0.25, min(4.0, zoom))
                return .none

            case .clearError:
                state.error = nil
                return .none
            }
        }
    }
}
```

**Files**:
- `Features/Document/DocumentFeature.swift` (~80 lines)

**Validation**:
- [ ] State updates correctly on document load
- [ ] Loading state transitions properly
- [ ] Errors are captured and displayed

---

## Subtask T011: Create PDFRenderer

**Purpose**: Wrap PDFKit's PDFView in NSViewRepresentable for SwiftUI.

**Steps**:

1. Create `Renderers/PDFRenderer.swift`:

```swift
import SwiftUI
import PDFKit

struct PDFRenderer: NSViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int
    @Binding var selection: PDFSelection?

    func makeNSView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.delegate = context.coordinator

        // Enable text selection
        pdfView.displaysAsBook = false

        return pdfView
    }

    func updateNSView(_ pdfView: PDFView, context: Context) {
        if pdfView.document !== document {
            pdfView.document = document
        }

        // Navigate to page if changed externally
        if let page = document.page(at: currentPage - 1),
           pdfView.currentPage !== page {
            pdfView.go(to: page)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, PDFViewDelegate {
        var parent: PDFRenderer

        init(_ parent: PDFRenderer) {
            self.parent = parent
            super.init()

            // Observe page changes
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(pageChanged),
                name: .PDFViewPageChanged,
                object: nil
            )

            // Observe selection changes
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(selectionChanged),
                name: .PDFViewSelectionChanged,
                object: nil
            )
        }

        @objc func pageChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView,
                  let currentPage = pdfView.currentPage,
                  let pageIndex = pdfView.document?.index(for: currentPage) else {
                return
            }
            parent.currentPage = pageIndex + 1
        }

        @objc func selectionChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView else { return }
            parent.selection = pdfView.currentSelection
        }
    }
}
```

**Files**:
- `Renderers/PDFRenderer.swift` (~90 lines)

**Validation**:
- [ ] PDF renders correctly with proper layout
- [ ] Scrolling is smooth
- [ ] Page navigation works
- [ ] Text selection is captured

---

## Subtask T012: Create MarkdownRenderer

**Purpose**: Render markdown content using AttributedString.

**Steps**:

1. Create `Renderers/MarkdownRenderer.swift`:

```swift
import SwiftUI

struct MarkdownRenderer: View {
    let content: String
    @Binding var selection: String?

    @State private var attributedContent: AttributedString?

    var body: some View {
        ScrollView {
            if let attributed = attributedContent {
                Text(attributed)
                    .textSelection(.enabled)
                    .font(.body)
                    .lineSpacing(4)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ProgressView()
                    .padding()
            }
        }
        .task(id: content) {
            await parseMarkdown()
        }
    }

    private func parseMarkdown() async {
        do {
            // Parse markdown to AttributedString
            var attributed = try AttributedString(
                markdown: content,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .inlineOnlyPreservingWhitespace
                )
            )

            // Apply styling
            attributed.font = .body
            attributed.foregroundColor = .primary

            await MainActor.run {
                self.attributedContent = attributed
            }
        } catch {
            // Fallback to plain text if markdown parsing fails
            await MainActor.run {
                self.attributedContent = AttributedString(content)
            }
        }
    }
}

#Preview {
    MarkdownRenderer(
        content: """
        # Heading 1

        This is **bold** and *italic* text.

        - List item 1
        - List item 2

        > A blockquote

        `inline code`
        """,
        selection: .constant(nil)
    )
}
```

**Files**:
- `Renderers/MarkdownRenderer.swift` (~70 lines)

**Validation**:
- [ ] Headings render with correct sizes
- [ ] Bold and italic text styled correctly
- [ ] Lists render properly
- [ ] Code blocks are monospaced

---

## Subtask T013: Create PlainTextRenderer

**Purpose**: Render plain text with appropriate typography.

**Steps**:

1. Create `Renderers/PlainTextRenderer.swift`:

```swift
import SwiftUI

struct PlainTextRenderer: View {
    let content: String
    @Binding var selection: String?

    var body: some View {
        ScrollView {
            Text(content)
                .textSelection(.enabled)
                .font(.system(.body, design: .monospaced))
                .lineSpacing(4)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    PlainTextRenderer(
        content: """
        This is plain text content.

        It should render with monospaced font
        and proper line spacing.

        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        """,
        selection: .constant(nil)
    )
}
```

**Files**:
- `Renderers/PlainTextRenderer.swift` (~35 lines)

**Validation**:
- [ ] Text displays with readable typography
- [ ] Monospaced font applied
- [ ] Scrolling works for long content

---

## Subtask T014: Create Unified DocumentView

**Purpose**: Create view that switches between renderers based on document type.

**Steps**:

1. Create `Features/Document/DocumentView.swift`:

```swift
import SwiftUI
import ComposableArchitecture
import PDFKit

struct DocumentView: View {
    @Bindable var store: StoreOf<DocumentFeature>
    @Binding var textSelection: String?
    @State private var pdfSelection: PDFSelection?

    var body: some View {
        Group {
            if store.isLoading {
                loadingView
            } else if let document = store.document {
                documentContent(document)
            } else {
                emptyView
            }
        }
        .onChange(of: pdfSelection) { _, newValue in
            textSelection = newValue?.string
        }
    }

    @ViewBuilder
    private func documentContent(_ document: Document) -> some View {
        switch document.content {
        case .pdf(let pdfDoc):
            PDFRenderer(
                document: pdfDoc,
                currentPage: Binding(
                    get: { store.currentPage },
                    set: { store.send(.setPage($0)) }
                ),
                selection: $pdfSelection
            )

        case .text(let content):
            if document.type == .markdown {
                MarkdownRenderer(
                    content: content,
                    selection: $textSelection
                )
            } else {
                PlainTextRenderer(
                    content: content,
                    selection: $textSelection
                )
            }
        }
    }

    private var loadingView: some View {
        VStack {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading document...")
                .foregroundStyle(.secondary)
                .padding(.top)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text")
                .font(.system(size: 48))
                .foregroundStyle(.tertiary)

            Text("Open a Document")
                .font(.title2)
                .foregroundStyle(.secondary)

            Text("Drop a file here or use File → Open")
                .foregroundStyle(.tertiary)

            Text("Supports: PDF, Markdown, Plain Text")
                .font(.caption)
                .foregroundStyle(.quaternary)
        }
    }
}
```

**Files**:
- `Features/Document/DocumentView.swift` (~90 lines)

**Validation**:
- [ ] Correct renderer shown for each document type
- [ ] Loading state displays spinner
- [ ] Empty state matches mockup #2
- [ ] Text selection propagates correctly

---

## Definition of Done

- [ ] PDF files render with correct layout and text selection
- [ ] Markdown files render with proper formatting
- [ ] Plain text files display with readable typography
- [ ] DocumentView switches renderers based on type
- [ ] Loading and empty states display correctly
- [ ] All renderers support smooth scrolling

## Risks

| Risk | Mitigation |
|------|------------|
| PDFKit selection issues | Use coordinator pattern for delegates |
| Markdown parsing edge cases | Fall back to plain text on parse errors |
| Large document performance | Use async parsing for markdown |

## Reviewer Guidance

1. Test with various PDF files (simple, complex, scanned)
2. Verify markdown renders all common elements
3. Check scrolling performance on large documents
4. Ensure text selection works in all formats
5. Verify empty state matches mockup exactly
