import SwiftUI
import PDFKit

struct PDFRenderer: NSViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int
    @Binding var selection: PDFSelection?
    @Binding var selectionRect: CGRect?

    func makeNSView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.autoScales = true
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

            NotificationCenter.default.addObserver(
                self,
                selector: #selector(pageChanged),
                name: .PDFViewPageChanged,
                object: nil
            )

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
    }
}
