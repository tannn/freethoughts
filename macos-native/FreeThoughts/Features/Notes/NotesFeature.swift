import ComposableArchitecture
import Foundation

@Reducer
struct NotesFeature {
    @ObservableState
    struct State: Equatable {
        var notes: [NoteItem] = []
        var currentDocumentPath: String?
        var isCreatingNote: Bool = false
        var noteCreationSelection: TextSelection?
        var noteCreationContent: String = ""
        var editingNoteId: UUID?
        var editingDraftText: String = ""
        var confirmingDeleteNoteId: UUID?
    }

    enum Action {
        case loadNotes(documentPath: String)
        case notesLoaded([NoteItem])
        case startNoteCreation(TextSelection)
        case cancelNoteCreation
        case updateNoteContent(String)
        case saveNote
        case noteSaved(NoteItem)
        case requestDeleteNote(UUID)
        case confirmDeleteNote
        case cancelDeleteNote
        case deleteNote(UUID)
        case noteDeleted(UUID)
        case startEditing(UUID)
        case stopEditing
        case updateNoteText(UUID, String)
        case updateDraftText(String)
        case navigateToNote(UUID)
    }

    @Dependency(NotesClient.self) var notesClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .loadNotes(let path):
                state.currentDocumentPath = path
                return .run { send in
                    let notes = try await notesClient.loadNotes(path)
                    await send(.notesLoaded(notes))
                }

            case .notesLoaded(let notes):
                state.notes = notes.sorted { note1, note2 in
                    if let page1 = note1.anchorPage, let page2 = note2.anchorPage {
                        if page1 != page2 { return page1 < page2 }
                    }
                    return note1.anchorStart < note2.anchorStart
                }
                return .none

            case .startNoteCreation(let selection):
                state.isCreatingNote = true
                state.noteCreationSelection = selection
                state.noteCreationContent = ""
                return .none

            case .cancelNoteCreation:
                state.isCreatingNote = false
                state.noteCreationSelection = nil
                state.noteCreationContent = ""
                return .none

            case .updateNoteContent(let content):
                state.noteCreationContent = content
                return .none

            case .saveNote:
                guard let selection = state.noteCreationSelection else {
                    return .none
                }

                let noteItem = NoteItem(
                    documentPath: selection.documentPath,
                    anchorStart: selection.range.startOffset,
                    anchorEnd: selection.range.endOffset,
                    anchorPage: selection.range.page,
                    selectedText: selection.text,
                    content: state.noteCreationContent
                )

                state.isCreatingNote = false
                state.noteCreationSelection = nil
                state.noteCreationContent = ""

                return .run { send in
                    let saved = try await notesClient.saveNote(noteItem)
                    await send(.noteSaved(saved))
                }

            case .noteSaved(let note):
                state.notes.append(note)
                state.notes.sort { note1, note2 in
                    if let page1 = note1.anchorPage, let page2 = note2.anchorPage {
                        if page1 != page2 { return page1 < page2 }
                    }
                    return note1.anchorStart < note2.anchorStart
                }
                return .none

            case .requestDeleteNote(let id):
                state.confirmingDeleteNoteId = id
                return .none

            case .confirmDeleteNote:
                guard let id = state.confirmingDeleteNoteId else { return .none }
                state.confirmingDeleteNoteId = nil
                return .run { send in
                    try await notesClient.deleteNote(id)
                    await send(.noteDeleted(id))
                }

            case .cancelDeleteNote:
                state.confirmingDeleteNoteId = nil
                return .none

            case .deleteNote(let id):
                return .run { send in
                    try await notesClient.deleteNote(id)
                    await send(.noteDeleted(id))
                }

            case .noteDeleted(let id):
                state.notes.removeAll { $0.id == id }
                if state.editingNoteId == id {
                    state.editingNoteId = nil
                    state.editingDraftText = ""
                }
                return .none

            case .startEditing(let id):
                state.editingNoteId = id
                if let note = state.notes.first(where: { $0.id == id }) {
                    state.editingDraftText = note.content
                }
                return .none

            case .stopEditing:
                state.editingNoteId = nil
                state.editingDraftText = ""
                return .none

            case .updateDraftText(let text):
                state.editingDraftText = text
                return .none

            case .updateNoteText(let id, let text):
                if let index = state.notes.firstIndex(where: { $0.id == id }) {
                    state.notes[index].content = text
                    state.notes[index].updatedAt = Date()
                    let noteId = state.notes[index].id
                    return .run { _ in
                        try await notesClient.updateNote(noteId, text)
                    }
                }
                return .none

            case .navigateToNote:
                return .none
            }
        }
    }
}
