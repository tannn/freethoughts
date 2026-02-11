import Foundation
import PDFKit

struct TextSelection: Equatable {
    let text: String
    let documentPath: String
    let range: SelectionRange
    let rect: CGRect

    enum SelectionRange: Equatable {
        case pdf(page: Int, start: Int, end: Int)
        case text(start: Int, end: Int)

        var startOffset: Int {
            switch self {
            case .pdf(_, let start, _): return start
            case .text(let start, _): return start
            }
        }

        var endOffset: Int {
            switch self {
            case .pdf(_, _, let end): return end
            case .text(_, let end): return end
            }
        }

        var page: Int? {
            switch self {
            case .pdf(let page, _, _): return page
            case .text: return nil
            }
        }
    }

    static func from(pdfSelection: PDFSelection, documentPath: String, rect: CGRect) -> TextSelection? {
        guard let string = pdfSelection.string, !string.isEmpty else { return nil }

        let pages = pdfSelection.pages
        guard let firstPage = pages.first,
              let pageIndex = firstPage.document?.index(for: firstPage) else {
            return nil
        }

        let range = SelectionRange.pdf(page: pageIndex, start: 0, end: string.count)

        return TextSelection(
            text: string,
            documentPath: documentPath,
            range: range,
            rect: rect
        )
    }

    static func from(text: String, documentPath: String, rect: CGRect, start: Int, end: Int) -> TextSelection? {
        guard !text.isEmpty, start >= 0, end >= start else { return nil }

        return TextSelection(
            text: text,
            documentPath: documentPath,
            range: .text(start: start, end: end),
            rect: rect
        )
    }
}
