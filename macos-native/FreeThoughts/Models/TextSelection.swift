import Foundation
import PDFKit

/// Captures a user's text selection in either a PDF page or a text document.
/// Stored in TCA state and passed to `NoteItem` / `ProvocationRequest` to anchor content.
struct TextSelection: Equatable {
    /// The raw selected string.
    let text: String
    /// Canonical path of the source document.
    let documentPath: String
    /// The character-level range of the selection within the document.
    let range: SelectionRange
    /// The bounding rect of the selection in the renderer's coordinate space (NSView coordinates).
    let rect: CGRect

    /// Describes where a selection falls in the document.
    enum SelectionRange: Equatable {
        /// A selection within a PDF page.  `page` is 0-based.
        case pdf(page: Int, start: Int, end: Int)
        /// A selection within a plain-text or Markdown string.
        case text(start: Int, end: Int)

        /// The start character offset, regardless of selection type.
        var startOffset: Int {
            switch self {
            case .pdf(_, let start, _): return start
            case .text(let start, _): return start
            }
        }

        /// The end character offset, regardless of selection type.
        var endOffset: Int {
            switch self {
            case .pdf(_, _, let end): return end
            case .text(_, let end): return end
            }
        }

        /// The 0-based PDF page index, or `nil` for text-document selections.
        var page: Int? {
            switch self {
            case .pdf(let page, _, _): return page
            case .text: return nil
            }
        }
    }

    /// Constructs a `TextSelection` from a `PDFSelection` and its bounding rect in view coordinates.
    /// Returns `nil` if the selection string is empty or the page cannot be identified.
    static func from(pdfSelection: PDFSelection, documentPath: String, rect: CGRect) -> TextSelection? {
        guard let string = pdfSelection.string, !string.isEmpty else { return nil }

        let pages = pdfSelection.pages
        guard let firstPage = pages.first,
              let pageIndex = firstPage.document?.index(for: firstPage) else {
            return nil
        }

        var startOffset = 0
        var endOffset = string.count
        let selectionRange = pdfSelection.range(at: 0, on: firstPage)
        if selectionRange.location != NSNotFound {
            startOffset = selectionRange.location
            endOffset = selectionRange.location + selectionRange.length
        } else if let pageString = firstPage.string {
            let nsRange = (pageString as NSString).range(of: string, options: [])
            if nsRange.location != NSNotFound {
                startOffset = nsRange.location
                endOffset = nsRange.location + nsRange.length
            }
        }

        let range = SelectionRange.pdf(page: pageIndex, start: startOffset, end: endOffset)

        return TextSelection(
            text: string,
            documentPath: documentPath,
            range: range,
            rect: rect
        )
    }

    /// Constructs a `TextSelection` from a plain-text selection with a known character range.
    /// Returns `nil` if `text` is empty or `start`/`end` are invalid.
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
