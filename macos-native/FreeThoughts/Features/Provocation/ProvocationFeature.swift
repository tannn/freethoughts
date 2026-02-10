import ComposableArchitecture
import Foundation

@Reducer
struct ProvocationFeature {
    @ObservableState
    struct State: Equatable {
        var isAIAvailable: Bool = false
        var availablePrompts: [ProvocationPrompt] = []
        var selectedPromptId: UUID?
        var isGenerating: Bool = false
        var currentResponse: String = ""
        var pendingRequest: ProvocationRequest?
        var error: String?
    }

    struct ProvocationRequest: Equatable {
        let sourceType: Provocation.SourceType
        let sourceText: String
        let context: String
        let documentPath: String
        let noteId: UUID?
    }

    enum Action {
        case seedDefaultPrompts
        case promptsSeeded
        case loadPrompts
        case promptsLoaded([ProvocationPrompt])
        case selectPrompt(UUID)
        case requestProvocation(ProvocationRequest)
        case startGeneration
        case responseChunk(String)
        case generationComplete
        case generationFailed(String)
        case saveProvocation
        case provocationSaved(Provocation)
        case clearResponse
        case dismissError
    }

    @Dependency(\.foundationModelsClient) var ai
    @Dependency(\.promptsClient) var prompts

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .seedDefaultPrompts:
                return .run { send in
                    if await prompts.hasSeededDefaults() {
                        await send(.loadPrompts)
                        return
                    }

                    do {
                        let defaults = try PromptSeeder.loadDefaultPrompts()
                        for prompt in defaults {
                            let entity = ProvocationPrompt(
                                name: prompt.name,
                                promptTemplate: prompt.promptTemplate,
                                isBuiltIn: true,
                                sortOrder: prompt.sortOrder
                            )
                            try await prompts.savePrompt(entity)
                        }
                        try await prompts.markSeeded()
                        await send(.promptsSeeded)
                    } catch {
                        print("Failed to seed prompts: \(error)")
                        await send(.loadPrompts)
                    }
                }

            case .promptsSeeded:
                return .send(.loadPrompts)

            case .loadPrompts:
                return .run { send in
                    let loaded = try await prompts.loadPrompts()
                    await send(.promptsLoaded(loaded))
                }

            case .promptsLoaded(let loaded):
                state.availablePrompts = loaded
                if state.selectedPromptId == nil, let first = loaded.first {
                    state.selectedPromptId = first.id
                }
                return .none

            case .selectPrompt(let id):
                state.selectedPromptId = id
                return .none

            case .requestProvocation(let request):
                state.pendingRequest = request
                state.currentResponse = ""
                state.error = nil
                return .none

            case .startGeneration:
                guard let request = state.pendingRequest,
                      let promptId = state.selectedPromptId,
                      let prompt = state.availablePrompts.first(where: { $0.id == promptId }) else {
                    return .none
                }

                state.isGenerating = true

                let fullPrompt = prompt.promptTemplate
                    .replacingOccurrences(of: "{selection}", with: request.sourceText)
                    .replacingOccurrences(of: "{context}", with: request.context)

                return .run { send in
                    do {
                        for try await chunk in try await ai.generate(fullPrompt, request.context) {
                            await send(.responseChunk(chunk))
                        }
                        await send(.generationComplete)
                    } catch {
                        await send(.generationFailed(error.localizedDescription))
                    }
                }

            case .responseChunk(let chunk):
                state.currentResponse += chunk
                return .none

            case .generationComplete:
                state.isGenerating = false
                return .send(.saveProvocation)

            case .generationFailed(let error):
                state.isGenerating = false
                state.error = error
                return .none

            case .saveProvocation:
                guard let request = state.pendingRequest,
                      let promptId = state.selectedPromptId,
                      let prompt = state.availablePrompts.first(where: { $0.id == promptId }) else {
                    return .none
                }

                let response = state.currentResponse
                return .run { send in
                    let provocation = Provocation(
                        documentPath: request.documentPath,
                        sourceType: request.sourceType,
                        sourceText: request.sourceText,
                        promptName: prompt.name,
                        response: response
                    )
                    try await prompts.saveProvocation(provocation)
                    await send(.provocationSaved(provocation))
                }

            case .provocationSaved:
                state.pendingRequest = nil
                return .none

            case .clearResponse:
                state.currentResponse = ""
                state.pendingRequest = nil
                return .none

            case .dismissError:
                state.error = nil
                return .none
            }
        }
    }
}
