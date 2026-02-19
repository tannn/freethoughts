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
        var error: String?
        // Collapse
        var collapsedNoteIds: Set<UUID> = []
        // Search
        var searchQuery: String = ""
        var isSearchBarVisible: Bool = false
        // Selection / bulk delete
        var isSelectingForDeletion: Bool = false
        var selectedNoteIds: Set<UUID> = []
        var confirmingDeleteAll: Bool = false
        var confirmingDeleteSelected: Bool = false
    }

    enum Action {
        case loadNotes(documentPath: String)
        case notesLoaded([NoteItem])
        case notesLoadFailed(String)
        case startNoteCreation(TextSelection)
        case cancelNoteCreation
        case updateNoteContent(String)
        case saveNote
        case noteSaved(NoteItem)
        case noteSaveFailed(String)
        case requestDeleteNote(UUID)
        case noteDeleted(UUID)
        case noteDeleteFailed(UUID, String)
        case startEditing(UUID)
        case stopEditing
        case updateNoteText(UUID, String)
        case noteUpdateFailed(UUID, String, Date, String)
        case updateDraftText(String)
        case navigateToNote(UUID)
        case dismissError
        // Collapse
        case toggleCollapseNote(UUID)
        case collapseAll
        case expandAll
        // Search
        case toggleSearchBar
        case updateSearchQuery(String)
        // Select mode
        case enterSelectMode
        case exitSelectMode
        case toggleNoteSelection(UUID)
        case selectAll
        // Bulk deletion
        case requestDeleteAll
        case confirmDeleteAll
        case cancelDeleteAll
        case requestDeleteSelected
        case confirmDeleteSelected
        case cancelDeleteSelected
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
                state.collapsedNoteIds = []
                state.searchQuery = ""
                state.isSearchBarVisible = false
                let noteIds = Set(notes.map(\.id))
                state.selectedNoteIds = state.selectedNoteIds.intersection(noteIds)
                state.isSelectingForDeletion = false
                state.confirmingDeleteSelected = false
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
                state.collapsedNoteIds.remove(id)
                state.selectedNoteIds.remove(id)
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

            // MARK: - Collapse

            case .toggleCollapseNote(let id):
                if state.collapsedNoteIds.contains(id) {
                    state.collapsedNoteIds.remove(id)
                } else {
                    state.collapsedNoteIds.insert(id)
                }
                return .none

            case .collapseAll:
                state.collapsedNoteIds = Set(state.notes.map(\.id))
                return .none

            case .expandAll:
                state.collapsedNoteIds = []
                return .none

            // MARK: - Search

            case .toggleSearchBar:
                state.isSearchBarVisible.toggle()
                if !state.isSearchBarVisible {
                    state.searchQuery = ""
                }
                return .none

            case .updateSearchQuery(let query):
                state.searchQuery = query
                return .none

            // MARK: - Select Mode

            case .enterSelectMode:
                if state.editingNoteId != nil {
                    state.editingNoteId = nil
                    state.editingDraftText = ""
                }
                state.isSelectingForDeletion = true
                return .none

            case .exitSelectMode:
                state.isSelectingForDeletion = false
                state.selectedNoteIds = []
                return .none

            case .toggleNoteSelection(let id):
                if state.selectedNoteIds.contains(id) {
                    state.selectedNoteIds.remove(id)
                } else {
                    state.selectedNoteIds.insert(id)
                }
                return .none

            case .selectAll:
                let filteredIds = Set(Self.filteredNotes(for: state).map(\.id))
                guard !filteredIds.isEmpty else { return .none }
                let allSelected = filteredIds.allSatisfy { state.selectedNoteIds.contains($0) }
                if allSelected {
                    state.selectedNoteIds.subtract(filteredIds)
                } else {
                    state.selectedNoteIds.formUnion(filteredIds)
                }
                return .none

            // MARK: - Bulk Deletion

            case .requestDeleteAll:
                state.confirmingDeleteAll = true
                return .none

            case .cancelDeleteAll:
                state.confirmingDeleteAll = false
                return .none

            case .confirmDeleteAll:
                state.confirmingDeleteAll = false
                let ids = state.notes.map(\.id)
                return .run { send in
                    await withTaskGroup(of: Void.self) { group in
                        for id in ids {
                            group.addTask {
                                do {
                                    try await notesClient.deleteNote(id)
                                    await send(.noteDeleted(id))
                                } catch {
                                    await send(.noteDeleteFailed(id, error.localizedDescription))
                                }
                            }
                        }
                    }
                }

            case .requestDeleteSelected:
                state.confirmingDeleteSelected = true
                return .none

            case .cancelDeleteSelected:
                state.confirmingDeleteSelected = false
                return .none

            case .confirmDeleteSelected:
                state.confirmingDeleteSelected = false
                let noteIds = Set(state.notes.map(\.id))
                let ids = Array(state.selectedNoteIds.intersection(noteIds))
                guard !ids.isEmpty else { return .none }
                return .run { send in
                    var hadFailure = false
                    await withTaskGroup(of: Bool.self) { group in
                        for id in ids {
                            group.addTask {
                                do {
                                    try await notesClient.deleteNote(id)
                                    await send(.noteDeleted(id))
                                    return true
                                } catch {
                                    await send(.noteDeleteFailed(id, error.localizedDescription))
                                    return false
                                }
                            }
                        }
                        for await success in group where !success {
                            hadFailure = true
                        }
                    }
                    if !hadFailure {
                        await send(.exitSelectMode)
                    }
                }
            }
        }
    }

    private static func filteredNotes(for state: State) -> [NoteItem] {
        let query = state.searchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return state.notes }
        let lowercaseQuery = query.lowercased()
        return state.notes.filter { note in
            if note.id == state.editingNoteId { return true }
            return note.selectedText.lowercased().contains(lowercaseQuery)
                || note.content.lowercased().contains(lowercaseQuery)
        }
    }
}

extension Array where Element == NoteItem {
    func sortedByAnchor() -> [NoteItem] {
        sorted { note1, note2 in
            if let page1 = note1.anchorPage, let page2 = note2.anchorPage {
                if page1 != page2 { return page1 < page2 }
            }
            return note1.anchorStart < note2.anchorStart
        }
    }
}
