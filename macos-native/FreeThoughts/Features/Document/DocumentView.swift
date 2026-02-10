import SwiftUI
import ComposableArchitecture
import PDFKit
import AppKit

struct DocumentView: View {
    @Bindable var store: StoreOf<DocumentFeature>
    @Binding var textSelection: String?
    @State private var pdfSelection: PDFSelection?
    @State private var selectionRect: CGRect?
    @State private var selectionRange: NSRange?

    @State private var highlightVisible = false

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

            if highlightVisible {
                Color.accentColor.opacity(0.15)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }

            if store.showSelectionPopover {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        store.send(.dismissPopover)
                    }
            }

            if store.showSelectionPopover,
               let selection = store.currentSelection {
                selectionPopoverOverlay(selection: selection)
            }

            if store.showSelectionPopover {
                EscapeKeyHandler {
                    store.send(.dismissPopover)
                }
                .frame(width: 0, height: 0)
            }
        }
        .onChange(of: store.highlightedRange?.id) { _, newValue in
            if newValue != nil {
                withAnimation(.easeIn(duration: 0.2)) {
                    highlightVisible = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    withAnimation(.easeOut(duration: 0.4)) {
                        highlightVisible = false
                    }
                }
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
        .onChange(of: selectionRange) { _, _ in
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
        } else if let text = textSelection,
                  !text.isEmpty,
                  let rect = selectionRect,
                  let range = selectionRange {
            let start = range.location
            let end = range.location + range.length
            let sel = TextSelection.from(
                text: text,
                documentPath: document.canonicalPath,
                rect: rect,
                start: start,
                end: end
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
                selectionRect: $selectionRect,
                scrollToPage: store.scrollToAnchorRequest?.page
            )

        case .text(let content):
            if document.type == .markdown {
                MarkdownRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRange: $selectionRange,
                    selectionRect: $selectionRect
                )
            } else {
                PlainTextRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRange: $selectionRange,
                    selectionRect: $selectionRect
                )
            }
        }
    }

    @ViewBuilder
    private func selectionPopoverOverlay(selection: TextSelection) -> some View {
        GeometryReader { geometry in
            let globalFrame = geometry.frame(in: .global)
            let localRect = CGRect(
                x: selection.rect.minX - globalFrame.minX,
                y: selection.rect.minY - globalFrame.minY,
                width: selection.rect.width,
                height: selection.rect.height
            )
            let popoverX = min(max(localRect.midX, 80), geometry.size.width - 80)
            let popoverY = min(localRect.maxY + 30, geometry.size.height - 40)

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

private struct EscapeKeyHandler: NSViewRepresentable {
    let onEscape: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onEscape: onEscape)
    }

    func makeNSView(context: Context) -> NSView {
        context.coordinator.startMonitoring()
        return NSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}

    final class Coordinator {
        private let onEscape: () -> Void
        private var monitor: Any?

        init(onEscape: @escaping () -> Void) {
            self.onEscape = onEscape
        }

        func startMonitoring() {
            guard monitor == nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self else { return event }
                if event.keyCode == 53 {
                    self.onEscape()
                    return nil
                }
                return event
            }
        }

        deinit {
            if let monitor {
                NSEvent.removeMonitor(monitor)
            }
        }
    }
}
