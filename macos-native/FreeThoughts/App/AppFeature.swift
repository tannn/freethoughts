import ComposableArchitecture
import Foundation

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
        var isSidebarCollapsed: Bool = false
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
        case toggleSidebar
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

            case .notes(.navigateToNote(let noteId)):
                guard let note = state.notes.notes.first(where: { $0.id == noteId }) else {
                    return .none
                }
                return .send(.document(.scrollToAnchor(
                    page: note.anchorPage,
                    start: note.anchorStart,
                    end: note.anchorEnd
                )))

            case .toggleSidebar:
                state.isSidebarCollapsed.toggle()
                return .none

            case .document, .notes, .provocation:
                return .none
            }
        }
    }
}
