import ComposableArchitecture
import SwiftData
import Foundation

@DependencyClient
struct PromptsClient {
    var loadPrompts: @Sendable () async throws -> [ProvocationPrompt]
    var savePrompt: @Sendable (_ prompt: ProvocationPrompt) async throws -> Void
    var saveProvocation: @Sendable (_ provocation: Provocation) async throws -> Void
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
                return try context.fetch(descriptor)
            },
            savePrompt: { prompt in
                let context = ModelContext(container)
                context.insert(prompt)
                try context.save()
            },
            saveProvocation: { provocation in
                let context = ModelContext(container)
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
