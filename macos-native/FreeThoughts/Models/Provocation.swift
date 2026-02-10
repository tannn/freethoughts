import Foundation
import SwiftData

@Model
final class Provocation {
    @Attribute(.unique) var id: UUID
    var documentPath: String
    var sourceType: SourceType
    var sourceText: String
    var promptName: String
    var response: String
    var createdAt: Date

    var note: Note?

    enum SourceType: String, Codable {
        case textSelection
        case note
    }

    init(
        id: UUID = UUID(),
        documentPath: String,
        sourceType: SourceType,
        sourceText: String,
        promptName: String,
        response: String,
        createdAt: Date = Date(),
        note: Note? = nil
    ) {
        self.id = id
        self.documentPath = documentPath
        self.sourceType = sourceType
        self.sourceText = sourceText
        self.promptName = promptName
        self.response = response
        self.createdAt = createdAt
        self.note = note
    }
}
