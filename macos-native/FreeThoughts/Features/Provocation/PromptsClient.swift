import ComposableArchitecture
import SwiftData
import Foundation

@DependencyClient
struct PromptsClient {
    var loadPrompts: @Sendable () async throws -> [ProvocationPromptItem]
    var savePrompt: @Sendable (_ prompt: ProvocationPromptItem) async throws -> Void
    var saveProvocation: @Sendable (_ provocation: ProvocationItem) async throws -> Void
    var hasSeededDefaults: @Sendable () async -> Bool = { false }
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
            saveProvocation: { item in
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
                context.insert(provocation)
                try context.save()
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
        saveProvocation: { _ in },
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
