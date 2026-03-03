import ComposableArchitecture
import Foundation
import os

/// TCA reducer that manages on-device AI provocation generation via Apple Foundation Models.
///
/// Responsible for seeding the default prompt library on first launch, streaming incremental
/// response chunks from the model, and persisting the finished response via `PromptsClient`.
@Reducer
struct ProvocationFeature {
    private enum CancelID { case generation }

    /// Provocation feature state.
    @ObservableState
    struct State: Equatable {
        /// Whether Apple Foundation Models is available on the current device/OS.
        var isAIAvailable: Bool = false
        /// The list of provocation prompt styles loaded from persistence.
        var availablePrompts: [ProvocationPromptItem] = []
        /// The ID of the currently selected prompt style.
        var selectedPromptId: UUID?
        /// `true` while a generation stream is active.
        var isGenerating: Bool = false
        /// The accumulated streaming response text (may be partial while generating).
        var currentResponse: String = ""
        /// The pending provocation request awaiting generation or save.
        var pendingRequest: ProvocationRequest?
        /// Human-readable error message to surface in an alert, or `nil`.
        var error: String?
    }

    /// Describes the input to an AI provocation request.
    struct ProvocationRequest: Equatable {
        /// Whether the source is a direct text selection or an existing note.
        let sourceType: Provocation.SourceType
        /// The primary text to provoke on (selection text or note body).
        let sourceText: String
        /// Surrounding context from the document, used to enrich the prompt.
        let context: String
        /// Canonical path of the source document, stored with the persisted provocation.
        let documentPath: String
        /// The note ID to associate the provocation with, if any.
        let noteId: UUID?
    }

    /// Actions handled by `ProvocationFeature`.
    enum Action {
        /// Seeds default prompts from `DefaultPrompts.json` on first launch.
        case seedDefaultPrompts
        /// Sent after default prompts have been successfully saved to disk.
        case promptsSeeded
        /// Loads the available prompt styles from persistence.
        case loadPrompts
        /// Delivers the loaded prompt list.
        case promptsLoaded([ProvocationPromptItem])
        /// Sets the active prompt style.
        case selectPrompt(UUID)
        /// Updates the AI availability flag (forwarded from `AppFeature`).
        case setAIAvailability(Bool)
        /// Stages a provocation request for generation.
        case requestProvocation(ProvocationRequest)
        /// Begins streaming generation for the current pending request.
        case startGeneration
        /// Delivers an incremental response chunk from the model stream.
        case responseChunk(String)
        /// Sent when the model stream completes successfully.
        case generationComplete
        /// Sent when generation fails, carrying a localised error description.
        case generationFailed(String)
        /// Persists the completed provocation response.
        case saveProvocation
        /// Delivers the persisted `ProvocationItem` after a successful save.
        case provocationSaved(ProvocationItem)
        /// Cancels any in-progress generation and clears response state.
        case clearResponse
        /// Dismisses the current error alert.
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
                        Logger(subsystem: "com.freethoughts", category: "ProvocationFeature")
                            .error("Failed to seed prompts: \(error)")
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

            case .setAIAvailability(let available):
                state.isAIAvailable = available
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
                state.currentResponse = chunk
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
