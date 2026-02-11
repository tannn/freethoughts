import Foundation

struct ProvocationItem: Equatable, Identifiable {
    var id: UUID
    var documentPath: String
    var sourceType: Provocation.SourceType
    var sourceText: String
    var promptName: String
    var response: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        documentPath: String,
        sourceType: Provocation.SourceType,
        sourceText: String,
        promptName: String,
        response: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.documentPath = documentPath
        self.sourceType = sourceType
        self.sourceText = sourceText
        self.promptName = promptName
        self.response = response
        self.createdAt = createdAt
    }

    init(from provocation: Provocation) {
        self.id = provocation.id
        self.documentPath = provocation.documentPath
        self.sourceType = provocation.sourceType
        self.sourceText = provocation.sourceText
        self.promptName = provocation.promptName
        self.response = provocation.response
        self.createdAt = provocation.createdAt
    }
}
