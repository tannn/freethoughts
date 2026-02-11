import Foundation

struct AnchorRequest: Equatable, Identifiable {
    let id: UUID
    let page: Int?
    let start: Int
    let end: Int
    let selectedText: String

    init(page: Int?, start: Int, end: Int, selectedText: String) {
        self.id = UUID()
        self.page = page
        self.start = start
        self.end = end
        self.selectedText = selectedText
    }
}
