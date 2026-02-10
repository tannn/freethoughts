import Foundation
import SwiftData

@Model
final class ProvocationPrompt {
    @Attribute(.unique) var id: UUID
    var name: String
    var promptTemplate: String
    var isBuiltIn: Bool
    var sortOrder: Int
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        promptTemplate: String,
        isBuiltIn: Bool = false,
        sortOrder: Int,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.promptTemplate = promptTemplate
        self.isBuiltIn = isBuiltIn
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}
