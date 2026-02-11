import SwiftUI
import ComposableArchitecture
import PDFKit
import AppKit

struct DocumentView: View {
    @Bindable var store: StoreOf<DocumentFeature>
    @Binding var textSelection: String?
    let isAIAvailable: Bool
    @State private var pdfSelection: PDFSelection?
    @State private var selectionRect: CGRect?
    @State private var selectionRange: NSRange?

    var body: some View {
        ZStack {
            Group {
                if store.isLoading {
                    loadingView
                        .transition(.opacity)
                } else if let document = store.document {
                    documentContent(document)
                        .transition(.opacity)
                } else {
                    emptyView
                        .transition(.opacity)
                }
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
        .animation(.easeInOut(duration: 0.2), value: store.isLoading)
    }

    /// Convert the current anchor request to an NSRange for text renderers
    private var textScrollToRange: NSRange? {
        guard let request = store.scrollToAnchorRequest,
              request.page == nil else {
            return nil
        }
        let length = max(0, request.end - request.start)
        return NSRange(location: request.start, length: length)
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
                zoomLevel: store.zoomLevel,
                scrollToAnchor: store.scrollToAnchorRequest,
                onZoomChange: { newZoom in
                    store.send(.setZoom(newZoom))
                }
            )

        case .text(let content):
            if document.type == .markdown {
                MarkdownRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRange: $selectionRange,
                    selectionRect: $selectionRect,
                    scrollToRange: textScrollToRange
                )
            } else {
                PlainTextRenderer(
                    content: content,
                    selection: $textSelection,
                    selectionRange: $selectionRange,
                    selectionRect: $selectionRect,
                    scrollToRange: textScrollToRange
                )
            }
        }
    }

    @ViewBuilder
    private func selectionPopoverOverlay(selection: TextSelection) -> some View {
        OverlayPositioningView(selection: selection) {
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
                },
                isAIAvailable: isAIAvailable
            )
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
            if let size = store.loadingFileSize {
                Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .transition(.opacity)
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

/// A view that properly positions an overlay relative to a selection rect
/// stored in NSView coordinates (bottom-left origin)
private struct OverlayPositioningView<Content: View>: View {
    let selection: TextSelection
    let content: Content

    init(selection: TextSelection, @ViewBuilder content: () -> Content) {
        self.selection = selection
        self.content = content()
    }

    var body: some View {
        GeometryReader { geometry in
            let viewHeight = geometry.size.height

            // Convert from NSView coordinates (bottom-left origin) to SwiftUI coordinates (top-left origin)
            // The selection rect comes from PDFView or NSTextView in their local coordinate space
            let localRect = CGRect(
                x: selection.rect.minX,
                y: viewHeight - selection.rect.maxY,  // Flip Y coordinate
                width: selection.rect.width,
                height: selection.rect.height
            )

            // Position the popover below and centered on the selection
            // Clamp to visible bounds with padding
            let popoverX = min(max(localRect.midX, 80), geometry.size.width - 80)
            let popoverY = min(localRect.maxY + 30, geometry.size.height - 40)

            content
                .position(x: popoverX, y: popoverY)
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
