import SwiftUI
import PDFKit

struct PDFRenderer: NSViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int
    @Binding var selection: PDFSelection?
    @Binding var selectionRect: CGRect?
    var zoomLevel: Double
    var scrollToAnchor: AnchorRequest?

    func makeNSView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.autoScales = false
        pdfView.scaleFactor = zoomLevel
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.delegate = context.coordinator
        pdfView.displaysAsBook = false
        return pdfView
    }

    func updateNSView(_ pdfView: PDFView, context: Context) {
        if pdfView.document !== document {
            pdfView.document = document
        }

        if pdfView.scaleFactor != zoomLevel {
            pdfView.scaleFactor = zoomLevel
        }

        if let anchor = scrollToAnchor,
           anchor.id != context.coordinator.lastScrolledAnchorId {
            context.coordinator.lastScrolledAnchorId = anchor.id
            scrollToAnchorInPDF(pdfView: pdfView, anchor: anchor)
        } else if scrollToAnchor == nil {
            if let page = document.page(at: currentPage - 1),
               pdfView.currentPage !== page {
                pdfView.go(to: page)
            }
        }
    }

    private func scrollToAnchorInPDF(pdfView: PDFView, anchor: AnchorRequest) {
        guard let targetPage = anchor.page,
              let page = document.page(at: targetPage) else { return }

        if !anchor.selectedText.isEmpty {
            let matches = document.findString(anchor.selectedText, withOptions: [.caseInsensitive])
            if let match = matches.first(where: { $0.pages.contains(page) }) {
                withAnimation(.easeInOut(duration: 0.3)) {
                    pdfView.setCurrentSelection(match, animate: true)
                    pdfView.scrollSelectionToVisible(nil)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                    pdfView.clearSelection()
                }
                return
            }
        }

        withAnimation(.easeInOut(duration: 0.3)) {
            pdfView.go(to: page)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, PDFViewDelegate {
        var parent: PDFRenderer
        var lastScrolledAnchorId: UUID?
        private var observers: [NSObjectProtocol] = []

        init(_ parent: PDFRenderer) {
            self.parent = parent
            super.init()

            let pageObserver = NotificationCenter.default.addObserver(
                forName: .PDFViewPageChanged,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.pageChanged(notification)
            }

            let selectionObserver = NotificationCenter.default.addObserver(
                forName: .PDFViewSelectionChanged,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.selectionChanged(notification)
            }

            observers = [pageObserver, selectionObserver]
        }

        func pageChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView,
                  let currentPage = pdfView.currentPage,
                  let pageIndex = pdfView.document?.index(for: currentPage) else {
                return
            }
            parent.currentPage = pageIndex + 1
        }

        func selectionChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView else { return }
            if let selection = pdfView.currentSelection,
               let string = selection.string,
               !string.isEmpty,
               let firstPage = selection.pages.first {
                let bounds = selection.bounds(for: firstPage)
                let viewRect = pdfView.convert(bounds, from: firstPage)
                let windowRect = pdfView.convert(viewRect, to: nil)

                parent.selection = selection
                if let window = pdfView.window {
                    parent.selectionRect = window.convertToScreen(windowRect)
                } else {
                    parent.selectionRect = windowRect
                }
            } else {
                parent.selection = nil
                parent.selectionRect = nil
            }
        }

        deinit {
            observers.forEach { NotificationCenter.default.removeObserver($0) }
        }
    }
}
