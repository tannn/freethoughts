import Foundation

/// Codable representation of a single entry in `DefaultPrompts.json`.
struct DefaultPrompt: Codable {
    let name: String
    let promptTemplate: String
    let sortOrder: Int
}

/// Loads the bundled `DefaultPrompts.json` file and decodes it into `DefaultPrompt` values.
/// Called once on first launch by `ProvocationFeature` to populate the prompt library.
enum PromptSeeder {
    /// Decodes and returns the default prompts from the app bundle.
    /// Throws `SeederError.fileNotFound` if `DefaultPrompts.json` is missing.
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
