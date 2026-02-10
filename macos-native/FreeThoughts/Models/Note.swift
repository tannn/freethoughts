import Foundation
import SwiftData

@Model
final class Note {
    @Attribute(.unique) var id: UUID
    var documentPath: String
    var anchorStart: Int
    var anchorEnd: Int
    var anchorPage: Int?
    var selectedText: String
    var content: String
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Provocation.note)
    var provocations: [Provocation] = []

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
}
