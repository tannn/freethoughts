import ComposableArchitecture
import Foundation

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
        var isAIAvailable: Bool = false
        var aiAvailabilityChecked: Bool = false
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
        case checkAIAvailability
        case aiAvailabilityResult(Bool)
    }

    @Dependency(\.foundationModelsClient) var foundationModelsClient

    var body: some ReducerOf<Self> {
        Scope(state: \.document, action: \.document) {
            DocumentFeature()
        }
        Scope(state: \.notes, action: \.notes) {
            NotesFeature()
        }
        Scope(state: \.provocation, action: \.provocation) {
            ProvocationFeature()
        }

        Reduce { state, action in
            switch action {
            case .onAppear:
                return .merge(
                    .send(.checkAIAvailability),
                    .send(.provocation(.seedDefaultPrompts))
                )

            case .checkAIAvailability:
                return .run { send in
                    let available = await foundationModelsClient.isAvailable()
                    await send(.aiAvailabilityResult(available))
                }

            case .aiAvailabilityResult(let available):
                state.isAIAvailable = available
                state.aiAvailabilityChecked = true
                state.provocation.isAIAvailable = available
                return .none

            case .document, .notes, .provocation:
                return .none
            }
        }
    }
}
