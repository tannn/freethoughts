import Foundation

struct DefaultPrompt: Codable {
    let name: String
    let promptTemplate: String
    let sortOrder: Int
}

enum PromptSeeder {
    static func loadDefaultPrompts() throws -> [DefaultPrompt] {
        guard let url = Bundle.main.url(forResource: "DefaultPrompts", withExtension: "json") else {
            throw SeederError.fileNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([DefaultPrompt].self, from: data)
    }

    enum SeederError: Error, LocalizedError {
        case fileNotFound

        var errorDescription: String? {
            switch self {
            case .fileNotFound:
                return "DefaultPrompts.json not found in bundle"
            }
        }
    }
}
