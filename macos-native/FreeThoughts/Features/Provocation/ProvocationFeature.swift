import ComposableArchitecture
import Foundation

@Reducer
struct ProvocationFeature {
    private enum CancelID { case generation }

    @ObservableState
    struct State: Equatable {
        var isAIAvailable: Bool = false
        var availablePrompts: [ProvocationPromptItem] = []
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
        case promptsLoaded([ProvocationPromptItem])
        case selectPrompt(UUID)
        case requestProvocation(ProvocationRequest)
        case startGeneration
        case responseChunk(String)
        case generationComplete
        case generationFailed(String)
        case saveProvocation
        case provocationSaved(ProvocationItem)
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
                            let item = ProvocationPromptItem(
                                name: prompt.name,
                                promptTemplate: prompt.promptTemplate,
                                isBuiltIn: true,
                                sortOrder: prompt.sortOrder
                            )
                            try await prompts.savePrompt(item)
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

                let promptStart = "You are generating a short provocation to help a reader think critically. Do not be authoritative. Respond with a question or statement. Maximum length: two sentences."
                let fullPrompt = promptStart + prompt.promptTemplate
                    .replacingOccurrences(of: "{selection}", with: request.sourceText)
                    .replacingOccurrences(of: "{context}", with: request.context)

                return .run { send in
                    do {
                        for try await chunk in try await ai.generate(fullPrompt) {
                            await send(.responseChunk(chunk))
                        }
                        await send(.generationComplete)
                    } catch {
                        await send(.generationFailed(error.localizedDescription))
                    }
                }
                .cancellable(id: CancelID.generation, cancelInFlight: true)

            case .responseChunk(let chunk):
                guard state.pendingRequest != nil else {
                    return .none
                }
                state.currentResponse += chunk
                return .none

            case .generationComplete:
                guard state.pendingRequest != nil else {
                    return .none
                }
                state.isGenerating = false
                return .send(.saveProvocation)

            case .generationFailed(let error):
                guard state.pendingRequest != nil else {
                    return .none
                }
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
                    let item = ProvocationItem(
                        documentPath: request.documentPath,
                        sourceType: request.sourceType,
                        sourceText: request.sourceText,
                        promptName: prompt.name,
                        response: response
                    )
                    let saved = try await prompts.saveProvocation(item, request.noteId)
                    await send(.provocationSaved(saved))
                }

            case .provocationSaved:
                state.pendingRequest = nil
                return .none

            case .clearResponse:
                state.isGenerating = false
                state.currentResponse = ""
                state.pendingRequest = nil
                return .cancel(id: CancelID.generation)

            case .dismissError:
                state.error = nil
                return .none
            }
        }
    }
}
