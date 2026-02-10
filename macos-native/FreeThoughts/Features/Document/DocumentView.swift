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
                selection: $pdfSelection,
                zoomLevel: store.zoomLevel
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

                Text("Drop a file here or use File -> Open")
                    .foregroundStyle(.secondary)
            }

            Text("Supports: PDF, Markdown, Plain Text")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.top, 8)
        }
        .padding(40)
    }
}
