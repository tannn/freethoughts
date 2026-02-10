import SwiftUI
import ComposableArchitecture
import PDFKit

struct DocumentView: View {
    @Bindable var store: StoreOf<DocumentFeature>
    @Binding var textSelection: String?
    @State private var pdfSelection: PDFSelection?
    @State private var selectionRect: CGRect?

    var body: some View {
        ZStack {
            Group {
                if store.isLoading {
                    loadingView
                } else if let document = store.document {
                    documentContent(document)
                } else {
                    emptyView
                }
            }

            if store.showSelectionPopover,
               let selection = store.currentSelection {
                selectionPopoverOverlay(selection: selection)
            }
        }
        .onChange(of: pdfSelection) { _, newValue in
            textSelection = newValue?.string
            updateSelection()
        }
        .onChange(of: textSelection) { _, _ in
            updateSelection()
        }
        .onChange(of: selectionRect) { _, _ in
            updateSelection()
        }
    }

    private func updateSelection() {
        guard let document = store.document else { return }

        if let pdfSel = pdfSelection, let rect = selectionRect {
            let sel = TextSelection.from(
                pdfSelection: pdfSel,
                documentPath: document.canonicalPath,
                rect: rect
            )
            store.send(.selectionChanged(sel))
        } else if let text = textSelection, !text.isEmpty, let rect = selectionRect {
            let fullContent: String
            if case .text(let content) = document.content {
                fullContent = content
            } else {
                fullContent = ""
            }
            let sel = TextSelection.from(
                text: text,
                fullContent: fullContent,
                documentPath: document.canonicalPath,
                rect: rect
            )
            store.send(.selectionChanged(sel))
        } else {
            store.send(.selectionChanged(nil))
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
                selection: $pdfSelection,
                selectionRect: $selectionRect
            )

        case .text(let content):
            if document.type == .markdown {
                MarkdownRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRect: $selectionRect
                )
            } else {
                PlainTextRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRect: $selectionRect
                )
            }
        }
    }

    @ViewBuilder
    private func selectionPopoverOverlay(selection: TextSelection) -> some View {
        GeometryReader { geometry in
            let popoverX = min(max(selection.rect.midX, 80), geometry.size.width - 80)
            let popoverY = min(selection.rect.maxY + 30, geometry.size.height - 40)

            SelectionPopover(
                selection: selection,
                onAddNote: {
                    store.send(.addNoteFromSelection)
                },
                onProvocation: {
                    store.send(.requestProvocationFromSelection)
                },
                onDismiss: {
                    store.send(.dismissPopover)
                }
            )
            .position(x: popoverX, y: popoverY)
        }
        .allowsHitTesting(true)
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

            Text("Drop a file here or use File -> Open")
                .foregroundStyle(.tertiary)

            Text("Supports: PDF, Markdown, Plain Text")
                .font(.caption)
                .foregroundStyle(.quaternary)
        }
    }
}
