import ComposableArchitecture
import SwiftData
import Foundation

/// TCA dependency client for prompt and provocation persistence.
///
/// Provides CRUD operations for `ProvocationPrompt` and `Provocation` SwiftData models,
/// plus helpers for the one-time default-prompt seeding flow.
@DependencyClient
struct PromptsClient {
    /// Loads all prompt styles sorted by `sortOrder`.
    var loadPrompts: @Sendable () async throws -> [ProvocationPromptItem]
    /// Persists a new `ProvocationPromptItem` to the SwiftData store.
    var savePrompt: @Sendable (_ prompt: ProvocationPromptItem) async throws -> Void
    /// Persists a completed `ProvocationItem` and optionally links it to the given note.
    var saveProvocation: @Sendable (_ provocation: ProvocationItem, _ noteId: UUID?) async throws -> ProvocationItem
    /// Returns `true` if the default prompts have already been seeded in this installation.
    var hasSeededDefaults: @Sendable () async -> Bool = { false }
    /// Marks the default-prompt seeding as completed so it is not repeated on next launch.
    var markSeeded: @Sendable () async throws -> Void
}

extension PromptsClient: DependencyKey {
    static let liveValue: PromptsClient = {
        @Dependency(\.modelContainer) var container

        return PromptsClient(
            loadPrompts: {
                let context = ModelContext(container)
                let descriptor = FetchDescriptor<ProvocationPrompt>(
                    sortBy: [SortDescriptor(\.sortOrder)]
                )
                return try context.fetch(descriptor).map { ProvocationPromptItem(from: $0) }
            },
            savePrompt: { item in
                let context = ModelContext(container)
                let prompt = ProvocationPrompt(
                    id: item.id,
                    name: item.name,
                    promptTemplate: item.promptTemplate,
                    isBuiltIn: item.isBuiltIn,
                    sortOrder: item.sortOrder,
                    createdAt: item.createdAt
                )
                context.insert(prompt)
                try context.save()
            },
            saveProvocation: { item, noteId in
                let context = ModelContext(container)
                let provocation = Provocation(
                    id: item.id,
                    documentPath: item.documentPath,
                    sourceType: item.sourceType,
                    sourceText: item.sourceText,
                    promptName: item.promptName,
                    response: item.response,
                    createdAt: item.createdAt
                )

                if let noteId {
                    let predicate = #Predicate<Note> { note in
                        note.id == noteId
                    }
                    let descriptor = FetchDescriptor(predicate: predicate)
                    if let note = try context.fetch(descriptor).first {
                        provocation.note = note
                    }
                }

                context.insert(provocation)
                try context.save()
                return ProvocationItem(from: provocation)
            },
            hasSeededDefaults: {
                UserDefaults.standard.bool(forKey: "defaultPromptsSeeded")
            },
            markSeeded: {
                UserDefaults.standard.set(true, forKey: "defaultPromptsSeeded")
            }
        )
    }()

    static let testValue = PromptsClient(
        loadPrompts: { [] },
        savePrompt: { _ in },
        saveProvocation: { item, _ in item },
        hasSeededDefaults: { true },
        markSeeded: {}
    )
}

extension DependencyValues {
    var promptsClient: PromptsClient {
        get { self[PromptsClient.self] }
        set { self[PromptsClient.self] = newValue }
    }
}
