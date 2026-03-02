import Foundation

/// Value-type projection of `ProvocationPrompt` used in TCA state.
///
/// Adds an `icon` computed property that maps well-known prompt names to SF Symbol names
/// for display in the selection popover and notes sidebar.
struct ProvocationPromptItem: Equatable, Identifiable, Sendable {
    var id: UUID
    var name: String
    /// The Handlebars-style template string (e.g. `"Challenge this: {selection}"`).
    var promptTemplate: String
    /// `true` for the built-in prompts shipped with the app.
    var isBuiltIn: Bool
    var sortOrder: Int
    var createdAt: Date

    var icon: String {
        switch name.lowercased() {
        case "challenge": return "magnifyingglass"
        case "expand": return "globe"
        case "simplify": return "lightbulb"
        case "question": return "questionmark"
        default: return "sparkles"
        }
    }

    static func icon(for name: String) -> String {
        switch name.lowercased() {
        case "challenge": return "magnifyingglass"
        case "expand": return "globe"
        case "simplify": return "lightbulb"
        case "question": return "questionmark"
        default: return "sparkles"
        }
    }

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

    init(from prompt: ProvocationPrompt) {
        self.id = prompt.id
        self.name = prompt.name
        self.promptTemplate = prompt.promptTemplate
        self.isBuiltIn = prompt.isBuiltIn
        self.sortOrder = prompt.sortOrder
        self.createdAt = prompt.createdAt
    }
}
