import Foundation

/// A request to scroll the document renderer to a specific text anchor.
///
/// Each new request is assigned a unique `id` so that `PDFRenderer`/`SelectableTextView`
/// can detect when a new scroll command has been issued even if the anchor coordinates
/// haven't changed (e.g. when navigating to the same note twice).
struct AnchorRequest: Equatable, Identifiable {
    /// Unique identifier used to detect new scroll requests.
    let id: UUID
    /// 0-based PDF page index, or `nil` for text documents.
    let page: Int?
    /// Start character offset within the page or document string.
    let start: Int
    /// End character offset within the page or document string.
    let end: Int
    /// The text to highlight after scrolling.
    let selectedText: String

    init(page: Int?, start: Int, end: Int, selectedText: String) {
        self.id = UUID()
        self.page = page
        self.start = start
        self.end = end
        self.selectedText = selectedText
    }
}
