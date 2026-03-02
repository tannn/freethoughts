import ComposableArchitecture
import Foundation

/// TCA reducer for the notes sidebar. Manages loading, creating, editing, and deleting
/// per-document notes, plus in-place inline editing with optimistic state and rollback.
@Reducer
struct NotesFeature {
    /// Notes sidebar state.
    @ObservableState
    struct State: Equatable {
        /// All notes loaded for the current document, sorted by anchor position.
        var notes: [NoteItem] = []
        /// The canonical file-system path of the document whose notes are loaded.
        var currentDocumentPath: String?
        /// `true` while the new-note creation sheet is presented.
        var isCreatingNote: Bool = false
        /// The text selection that triggered note creation; provides the anchor for the new note.
        var noteCreationSelection: TextSelection?
        /// Draft body text being typed in the note-creation sheet.
        var noteCreationContent: String = ""
        /// The ID of the note currently open for inline editing, or `nil`.
        var editingNoteId: UUID?
        /// The draft content for the note being edited in-line.
        var editingDraftText: String = ""
        /// When set, a delete-confirmation alert is shown for this note ID.
        var confirmingDeleteNoteId: UUID?
        /// Human-readable error message to display in an alert, or `nil`.
        var error: String?
    }

    /// Actions handled by `NotesFeature`.
    enum Action {
        /// Load notes for the given document path from the persistence layer.
        case loadNotes(documentPath: String)
        /// Delivers the loaded notes array.
        case notesLoaded([NoteItem])
        /// Delivers a localised error string when loading fails.
        case notesLoadFailed(String)
        /// Opens the note-creation sheet anchored to the given text selection.
        case startNoteCreation(TextSelection)
        /// Dismisses the note-creation sheet without saving.
        case cancelNoteCreation
        /// Updates the draft body text in the creation sheet.
        case updateNoteContent(String)
        /// Persists the note being created and dismisses the sheet.
        case saveNote
        /// Delivers the persisted `NoteItem` after a successful save.
        case noteSaved(NoteItem)
        /// Delivers a localised error string when saving fails.
        case noteSaveFailed(String)
        /// Shows a delete-confirmation alert for the given note ID.
        case requestDeleteNote(UUID)
        /// Confirmed: delete the note currently awaiting confirmation.
        case confirmDeleteNote
        /// Dismissed: clear the pending confirmation without deleting.
        case cancelDeleteNote
        /// Directly deletes a note by ID (bypasses confirmation; used internally).
        case deleteNote(UUID)
        /// Removes the deleted note from state.
        case noteDeleted(UUID)
        /// Delivers a localised error when deletion fails.
        case noteDeleteFailed(UUID, String)
        /// Enters inline-edit mode for the given note, seeding the draft with its current content.
        case startEditing(UUID)
        /// Exits inline-edit mode and clears the draft.
        case stopEditing
        /// Persists an updated note body; rolls back on failure.
        case updateNoteText(UUID, String)
        /// Rolls back optimistic state update after a persistence failure.
        case noteUpdateFailed(UUID, String, Date, String)
        /// Updates the in-memory draft while the user types (before `stopEditing`).
        case updateDraftText(String)
        /// Tells `AppFeature` to scroll the document to this note's anchor.
        case navigateToNote(UUID)
        /// Clears the current error.
        case dismissError
    }

    @Dependency(\.notesClient) var notesClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .loadNotes(let path):
                state.currentDocumentPath = path
                return .run { send in
                    do {
                        let notes = try await notesClient.loadNotes(path)
                        await send(.notesLoaded(notes))
                    } catch {
                        await send(.notesLoadFailed(error.localizedDescription))
                    }
                }

            case .notesLoaded(let notes):
                state.notes = notes.sortedByAnchor()
                return .none

            case .notesLoadFailed(let error):
                state.error = error
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
                    do {
                        let saved = try await notesClient.saveNote(noteItem)
                        await send(.noteSaved(saved))
                    } catch {
                        await send(.noteSaveFailed(error.localizedDescription))
                    }
                }

            case .noteSaved(let note):
                state.notes.append(note)
                state.notes = state.notes.sortedByAnchor()
                return .none

            case .noteSaveFailed(let error):
                state.error = error
                return .none

            case .requestDeleteNote(let id):
                state.confirmingDeleteNoteId = id
                return .none

            case .confirmDeleteNote:
                guard let id = state.confirmingDeleteNoteId else { return .none }
                state.confirmingDeleteNoteId = nil
                return .run { send in
                    do {
                        try await notesClient.deleteNote(id)
                        await send(.noteDeleted(id))
                    } catch {
                        await send(.noteDeleteFailed(id, error.localizedDescription))
                    }
                }

            case .cancelDeleteNote:
                state.confirmingDeleteNoteId = nil
                return .none

            case .deleteNote(let id):
                return .run { send in
                    do {
                        try await notesClient.deleteNote(id)
                        await send(.noteDeleted(id))
                    } catch {
                        await send(.noteDeleteFailed(id, error.localizedDescription))
                    }
                }

            case .noteDeleted(let id):
                state.notes.removeAll { $0.id == id }
                if state.editingNoteId == id {
                    state.editingNoteId = nil
                    state.editingDraftText = ""
                }
                return .none

            case .noteDeleteFailed(_, let error):
                state.error = error
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
                    let previousContent = state.notes[index].content
                    let previousUpdatedAt = state.notes[index].updatedAt
                    state.notes[index].content = text
                    state.notes[index].updatedAt = Date()
                    let noteId = state.notes[index].id
                    return .run { send in
                        do {
                            try await notesClient.updateNote(noteId, text)
                        } catch {
                            await send(.noteUpdateFailed(noteId, previousContent, previousUpdatedAt, error.localizedDescription))
                        }
                    }
                }
                return .none

            case .noteUpdateFailed(let id, let previousContent, let previousUpdatedAt, let error):
                if let index = state.notes.firstIndex(where: { $0.id == id }) {
                    state.notes[index].content = previousContent
                    state.notes[index].updatedAt = previousUpdatedAt
                }
                state.error = error
                return .none

            case .navigateToNote:
                return .none

            case .dismissError:
                state.error = nil
                return .none
            }
        }
    }
}

extension Array where Element == NoteItem {
    /// Returns the array sorted by document anchor position: page first, then character offset.
    func sortedByAnchor() -> [NoteItem] {
        sorted { note1, note2 in
            if let page1 = note1.anchorPage, let page2 = note2.anchorPage {
                if page1 != page2 { return page1 < page2 }
            }
            return note1.anchorStart < note2.anchorStart
        }
    }
}
