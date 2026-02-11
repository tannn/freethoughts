import Foundation

struct NoteItem: Equatable, Identifiable {
    var id: UUID
    var documentPath: String
    var anchorStart: Int
    var anchorEnd: Int
    var anchorPage: Int?
    var selectedText: String
    var content: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        documentPath: String,
        anchorStart: Int,
        anchorEnd: Int,
        anchorPage: Int? = nil,
        selectedText: String,
        content: String = "",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.documentPath = documentPath
        self.anchorStart = anchorStart
        self.anchorEnd = anchorEnd
        self.anchorPage = anchorPage
        self.selectedText = selectedText
        self.content = content
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from note: Note) {
        self.id = note.id
        self.documentPath = note.documentPath
        self.anchorStart = note.anchorStart
        self.anchorEnd = note.anchorEnd
        self.anchorPage = note.anchorPage
        self.selectedText = note.selectedText
        self.content = note.content
        self.createdAt = note.createdAt
        self.updatedAt = note.updatedAt
    }
}
