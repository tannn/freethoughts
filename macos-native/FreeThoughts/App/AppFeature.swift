import ComposableArchitecture
import Foundation

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
    }

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
                return .none

            case .document(.documentLoaded(let document)):
                return .send(.notes(.loadNotes(documentPath: document.canonicalPath)))

            case .document(.closeDocument):
                return .send(.notes(.loadNotes(documentPath: "")))

            case .document(.addNoteFromSelection):
                if let selection = state.document.currentSelection {
                    return .send(.notes(.startNoteCreation(selection)))
                }
                return .none

            case .document, .notes, .provocation:
                return .none
            }
        }
    }
}
